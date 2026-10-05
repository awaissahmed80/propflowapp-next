"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { MARKS, coverWarnings, dayKey, isDayKey, leaveOn, shiftRuns, todayKey } from "../roster"
import { hrAction, scoped } from "./context"
import { postRow, rosterData } from "./roster-queries"
import { rebuildDraft } from "./payroll"

// Changing the duty roster (all need hr.roster): posts and their shifts, regular duties, one-day
// changes (take someone off, add cover) and attendance. Responses { ok, … } | { error } | { fieldErrors }.

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "hr", action, actorUserId: ctx.user.id, summary })
const upper = (v) => String(v ?? "").toUpperCase()
const roster = () => hrAction("view", "hr.roster")
const postBy = (ctx, code) =>
  live(ctx.db, "dutyPosts")
    .where({ code: upper(code) })
    .first()
const employeeBy = (ctx, code) =>
  scoped(ctx, live(ctx.db, "employees"))
    .where({ code: upper(code) })
    .first("id", "code", "name", "status")
const NO_EMPLOYEE = { error: "That employee was removed or isn't yours to see." }
const NO_POST = { error: "That post was removed. Reload the page." }

const day = z.string().refine(isDayKey, "Pick the day.")
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 08:00.")
const weekdays = z.array(z.number().int().min(0).max(6)).max(7)

// ---------- posts ----------

const shiftSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,20}$/, "Shift keys are short lowercase words."),
  label: z.string().trim().min(1, "Name the shift.").max(40),
  start: time,
  end: time,
  needed: z.coerce.number().int().min(1, "At least one person.").max(50),
  days: weekdays.optional().nullable(),
})
const postSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(2, "Name the post.").max(120),
  project: z.string().trim().optional().nullable(), // project code; empty: head office
  kind: z.string().trim().min(1, "Pick what the post is for."),
  shifts: z.array(shiftSchema).min(1, "Add at least one shift.").max(6),
})

// Add or change a post → { ok, code }
export async function savePost(input) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const parsed = postSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!isLookupValue((await getLookups(ctx.db, ["post-kind"]))["post-kind"], v.kind)) return { fieldErrors: { kind: "Pick what the post is for." } }
  const keys = v.shifts.map((s) => s.key)
  if (new Set(keys).size !== keys.length) return { error: "Two shifts have the same key. Rename one." }
  for (const [i, s] of v.shifts.entries()) if (s.days && !s.days.length) return { fieldErrors: { [`shifts.${i}.days`]: "Pick at least one day." } }
  const project = v.project
    ? await live(ctx.db, "projects")
        .where({ code: upper(v.project) })
        .first("id")
    : null
  if (v.project && !project) return { fieldErrors: { project: "Pick a project, or Head office." } }
  const shifts = v.shifts.map((s) => ({ key: s.key, label: s.label, start: s.start, end: s.end, needed: s.needed, ...(s.days && s.days.length < 7 ? { days: [...s.days].sort() } : {}) }))
  const row = { name: v.name, projectId: project?.id ?? null, kind: v.kind, shifts: JSON.stringify(shifts) }
  if (v.code) {
    const post = await postBy(ctx, v.code)
    if (!post) return NO_POST
    // A shift with regular duties on it can't be removed until they're moved
    const gone = postRow(post).shifts.filter((s) => !keys.includes(s.key))
    if (gone.length) {
      const used = await ctx
        .db("dutyPatterns")
        .where({ postId: post.id })
        .whereIn(
          "shiftKey",
          gone.map((s) => s.key),
        )
        .countDistinct({ n: "employeeId" })
        .first()
      if (Number(used.n)) return { error: `${used.n} ${Number(used.n) === 1 ? "person has" : "people have"} regular duties on the ${gone.map((s) => s.label).join(" / ")} shift. Move them in Regular duties first.` }
    }
    await live(ctx.db, "dutyPosts")
      .where({ id: post.id })
      .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
    await log(ctx, "roster.post-changed", `changed the ${v.name} duty post (${post.code})`)
    return { ok: true, code: post.code }
  }
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "duty-post")
    await trx("dutyPosts").insert({ ...row, code, isActive: true, createdBy: ctx.user.id })
  })
  await log(ctx, "roster.post-added", `added the ${v.name} duty post (${code})`)
  return { ok: true, code }
}

// Take a post off the roster (or put it back). Regular duties there stay but don't apply while it's off.
export async function setPostActive(code, active) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const post = await postBy(ctx, code)
  if (!post) return NO_POST
  await live(ctx.db, "dutyPosts")
    .where({ id: post.id })
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: ctx.user.id })
  await log(ctx, active ? "roster.post-activated" : "roster.post-deactivated", `${active ? "put back" : "took off"} the ${post.name} duty post (${post.code})`)
  return { ok: true }
}

// ---------- regular duties ----------

const dutySchema = z.object({
  post: z.string().trim().min(1, "Pick the post."),
  shiftKey: z.string().trim().min(1, "Pick the shift."),
  days: weekdays.min(1, "Pick at least one day."),
  rotate: z.boolean().optional().default(false),
  weeks: z.enum(["", "odd", "even"]).optional().nullable(),
})

// Replace someone's regular duties: duties [{ post (code), shiftKey, days, rotate, weeks }] → { ok }
export async function savePattern(employee, duties) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const emp = await employeeBy(ctx, employee)
  if (!emp || emp.status !== "active") return NO_EMPLOYEE
  const parsed = z.array(dutySchema).max(10).safeParse(duties)
  if (!parsed.success) return fieldErrors(parsed)
  const posts = await live(ctx.db, "dutyPosts")
    .whereIn(
      "code",
      parsed.data.map((d) => upper(d.post)),
    )
    .select("id", "code", "shifts")
  const rows = []
  for (const [i, d] of parsed.data.entries()) {
    const post = posts.map(postRow).find((p) => p.code === upper(d.post))
    if (!post) return { fieldErrors: { [`${i}.post`]: "Pick the post." } }
    if (!post.shifts.some((s) => s.key === d.shiftKey)) return { fieldErrors: { [`${i}.shiftKey`]: "Pick the shift." } }
    rows.push({ employeeId: emp.id, postId: post.id, shiftKey: d.shiftKey, days: JSON.stringify([...new Set(d.days)].sort()), rotate: Boolean(d.rotate), weeks: d.weeks || null, createdBy: ctx.user.id })
  }
  await ctx.db.transaction(async (trx) => {
    await trx("dutyPatterns").where({ employeeId: emp.id }).delete()
    if (rows.length) await trx("dutyPatterns").insert(rows)
  })
  await log(ctx, "roster.duties-changed", `changed ${emp.name}'s regular duties`)
  return { ok: true }
}

// Take someone off the roster: no regular duties (office hours) → { ok }
export async function removePattern(employee) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const emp = await employeeBy(ctx, employee)
  if (!emp) return NO_EMPLOYEE
  await ctx.db("dutyPatterns").where({ employeeId: emp.id }).delete()
  await log(ctx, "roster.duties-removed", `took ${emp.name} off the roster`)
  return { ok: true }
}

// ---------- one-day changes ----------

const cellSchema = z.object({
  date: day,
  post: z.string().trim().min(1),
  shift: z.string().trim().min(1),
  employee: z.string().trim().min(1, "Pick someone."),
  action: z.enum(["add", "remove"]),
  note: z.string().trim().max(300).optional().default(""),
})

async function cellContext(ctx, input) {
  const parsed = cellSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const [post, emp] = await Promise.all([postBy(ctx, v.post), employeeBy(ctx, v.employee)])
  if (!post) return NO_POST
  if (!emp || emp.status !== "active") return NO_EMPLOYEE
  const shift = postRow(post).shifts.find((s) => s.key === v.shift)
  if (!shift) return { error: "That shift was removed. Reload the page." }
  if (!shiftRuns(shift, v.date)) return { error: `The ${shift.label.toLowerCase()} shift doesn't run that day.` }
  return { v, post, emp, shift }
}

// Before adding cover: why it might not be a good idea → { ok, warnings: [text] }
export async function checkCover(input) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const c = await cellContext(ctx, { ...input, action: "add" })
  if (!c.v) return c
  const d = await rosterData(ctx.db, c.v.date, c.v.date)
  return { ok: true, warnings: coverWarnings(d, { employeeId: c.emp.id, postId: c.post.id, shiftKey: c.shift.key, date: c.v.date }) }
}

// Take someone off a shift for a day, or add cover → { ok, warning? }
// Adding still goes ahead when they're on leave, already on another shift or it's their day off;
// the warning says so (pay overtime or give another day off).
export async function setCellOverride(input) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const c = await cellContext(ctx, input)
  if (!c.v) return c
  const { v, post, emp, shift } = c
  const d = await rosterData(ctx.db, v.date, v.date)
  const warnings = v.action === "add" ? coverWarnings(d, { employeeId: emp.id, postId: post.id, shiftKey: shift.key, date: v.date }) : []
  const same = { onDate: v.date, employeeId: emp.id, postId: post.id, shiftKey: shift.key }
  await ctx.db.transaction(async (trx) => {
    // The opposite change for the same person and shift cancels out; otherwise record this one
    const opposite = await trx("dutyOverrides")
      .where({ ...same, kind: v.action === "add" ? "remove" : "add" })
      .first("id")
    if (opposite) await trx("dutyOverrides").where({ id: opposite.id }).delete()
    else if (
      !(await trx("dutyOverrides")
        .where({ ...same, kind: v.action })
        .first("id"))
    )
      await trx("dutyOverrides").insert({ ...same, kind: v.action, note: v.note || null, createdBy: ctx.user.id })
  })
  await log(
    ctx,
    v.action === "add" ? "roster.cover-added" : "roster.taken-off",
    `${v.action === "add" ? "put" : "took"} ${emp.name} ${v.action === "add" ? "on" : "off"} ${post.name} (${shift.label.toLowerCase()}) for ${v.date}`,
  )
  return { ok: true, ...(warnings.length ? { warning: warnings.join(" ") } : {}) }
}

// ---------- attendance ----------

const markSchema = z.object({
  date: day,
  marks: z
    .array(z.object({ employee: z.string().trim().min(1), status: z.enum([...MARKS, ""]).nullable(), note: z.string().trim().max(300).optional().nullable() }))
    .min(1)
    .max(500),
})

// Mark attendance for a day (up to today): marks [{ employee (code), status present | late | absent | "" (clear), note }]
// People on approved leave that day are skipped. Absences reach payroll: an open draft for the
// month is rebuilt. → { ok, saved, skipped }
export async function markAttendance(date, marks) {
  const { ctx, error } = await roster()
  if (error) return { error }
  const parsed = markSchema.safeParse({ date, marks })
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (v.date > todayKey()) return { error: "Attendance can be marked from the day itself, not ahead." }
  const month = v.date.slice(0, 7)
  const run = await live(ctx.db, "payrollRuns").where({ month }).first("id", "status")
  if (run && run.status !== "draft")
    return {
      error: `${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))} payroll is already ${run.status}, so that month's attendance is closed.`,
    }
  const codes = [...new Set(v.marks.map((m) => upper(m.employee)))]
  const emps = await scoped(ctx, live(ctx.db, "employees")).whereIn("employees.code", codes).select("id", "code", "joinedOn", "leftOn")
  const byCode = new Map(emps.map((e) => [e.code, e]))
  const leave = await live(ctx.db, "leaveRequests")
    .where({ status: "approved" })
    .whereIn(
      "employeeId",
      emps.map((e) => e.id),
    )
    .where("startOn", "<=", v.date)
    .where("endOn", ">=", v.date)
    .select("employeeId", "startOn", "endOn")
  let saved = 0
  let skipped = 0
  let absenceChanged = false
  await ctx.db.transaction(async (trx) => {
    const before = new Map(
      (
        await trx("attendance")
          .where({ onDate: v.date })
          .whereIn(
            "employeeId",
            emps.map((e) => e.id),
          )
          .select("employeeId", "status")
      ).map((a) => [a.employeeId, a.status]),
    )
    for (const m of v.marks) {
      const e = byCode.get(upper(m.employee))
      if (!e || leaveOn(leave, e.id, v.date) || dayKey(e.joinedOn) > v.date || (e.leftOn && dayKey(e.leftOn) < v.date)) {
        skipped++
        continue
      }
      const was = before.get(e.id) ?? null
      if (!m.status) await trx("attendance").where({ employeeId: e.id, onDate: v.date }).delete()
      else
        await trx("attendance")
          .insert({ employeeId: e.id, onDate: v.date, status: m.status, note: m.note || null, markedBy: ctx.user.id, markedAt: new Date() })
          .onConflict(["employeeId", "onDate"])
          .merge(["status", "note", "markedBy", "markedAt"])
      if ((was === "absent") !== (m.status === "absent")) absenceChanged = true
      saved++
    }
    if (run && absenceChanged) await rebuildDraft(trx, run.id)
  })
  if (!saved && skipped) return { error: "Nobody to mark: they're on leave, not employed that day, or not yours to see." }
  return { ok: true, saved, skipped }
}
