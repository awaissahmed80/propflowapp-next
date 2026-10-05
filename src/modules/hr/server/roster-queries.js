import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { labelOf } from "@/modules/lookups/options"
import { addDays, assignments, dayKey, dutyStatus, isoWeek, leaveOn, officeDay, shiftRuns, shortBy, todayKey, weekDays, weekLabel, weekStart } from "../roster"
import { scoped } from "./context"

// Reading the duty roster: the week grid, a day's attendance list, posts, regular duties, and one
// person's duties (My Desk). People with hr.roster (or who see every employee) see every post;
// everyone else sees the posts and shifts where people they can see are on duty.

const parse = (v, fallback) => (v == null ? fallback : typeof v === "string" ? JSON.parse(v) : v)
const employedOn = (e, date) => (!e.joinedOn || dayKey(e.joinedOn) <= date) && (!e.leftOn || dayKey(e.leftOn) >= date)

export const postRow = (p) => ({ ...p, shifts: parse(p.shifts, []).map((s) => ({ ...s, needed: Number(s.needed) || 1, days: s.days?.length ? s.days : null })), isActive: Boolean(p.isActive) })

// Everything the roster rules need between two days (both included).
//   posts: active posts (all: with inactive ones) · employees: Map id → employee
export async function rosterData(db, from, to, { all = false } = {}) {
  const [posts, patterns, overrides, leave, marks, employees, projects, lists] = await Promise.all([
    live(db, "dutyPosts")
      .modify((q) => (all ? q : q.where({ isActive: true })))
      .orderBy("id")
      .select("id", "code", "name", "projectId", "kind", "shifts", "isActive"),
    db("dutyPatterns").orderBy("id").select("id", "employeeId", "postId", "shiftKey", "days", "rotate", "weeks"),
    db("dutyOverrides").whereBetween("onDate", [from, to]).orderBy("id").select("id", "onDate", "employeeId", "postId", "shiftKey", "kind", "note"),
    live(db, "leaveRequests").where({ status: "approved" }).where("startOn", "<=", to).where("endOn", ">=", from).select("employeeId", "startOn", "endOn", "type"),
    db("attendance").whereBetween("onDate", [from, to]).select("employeeId", "onDate", "status", "note"),
    live(db, "employees")
      .where((q) => q.where({ status: "active" }).orWhere("leftOn", ">=", from))
      .where("joinedOn", "<=", to)
      .orderBy("name")
      .select("id", "code", "name", "designation", "department", "userId", "teamId", "projectId", "joinedOn", "leftOn", "status"),
    live(db, "projects").orderBy("id").select("id", "code", "name"),
    getLookups(db, ["leave-type"]),
  ])
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const rows = posts.map(postRow).map((p) => ({ ...p, project: p.projectId ? (projectsById.get(p.projectId)?.name ?? null) : null }))
  // Posts by project in the projects' order, head office last
  const order = new Map(projects.map((p, i) => [p.id, i]))
  rows.sort((a, b) => (order.get(a.projectId) ?? 1e9) - (order.get(b.projectId) ?? 1e9) || a.id - b.id)
  return {
    posts: rows,
    patterns: patterns.map((p) => ({ ...p, days: parse(p.days, []), rotate: Boolean(p.rotate), weeks: p.weeks || null })),
    overrides: overrides.map((o) => ({ ...o, date: dayKey(o.onDate) })),
    leave: leave.map((l) => ({ ...l, typeLabel: labelOf(lists["leave-type"], l.type) ?? l.type })),
    marks: new Map(marks.map((m) => [`${m.employeeId}:${dayKey(m.onDate)}`, m])),
    employees: new Map(employees.map((e) => [e.id, e])),
    projects,
  }
}

// Who this person sees on the roster: everything (hr.roster or every employee), or the ids they can see
async function viewer(ctx) {
  const everything = Boolean(ctx.grant("hr.roster")) || ctx.scope === "all"
  const visible = everything ? null : new Set(await scoped(ctx, live(ctx.db, "employees")).pluck("employees.id"))
  return { everything, sees: (id) => everything || visible.has(id) }
}

function person(d, x, date, today) {
  const e = d.employees.get(x.employeeId)
  const leave = leaveOn(d.leave, e.id, date)
  const mark = d.marks.get(`${e.id}:${date}`)
  return {
    code: e.code,
    name: e.name,
    designation: e.designation,
    status: dutyStatus({ leave, mark: mark?.status, date, today }),
    note: mark?.note ?? null,
    leaveType: leave?.typeLabel ?? null,
    cover: Boolean(x.cover),
  }
}

// The people on one post's shift for a day, and how short it is
function cell(d, assigned, post, shift, date, today, v) {
  if (!shiftRuns(shift, date)) return { date, applies: false }
  const list = (assigned.get(`${post.id}:${shift.key}`) ?? []).filter((x) => d.employees.has(x.employeeId) && employedOn(d.employees.get(x.employeeId), date))
  const people = list.map((x) => person(d, x, date, today))
  const shown = v.everything ? people : people.filter((_, i) => v.sees(list[i].employeeId))
  return { date, applies: true, needed: shift.needed, people: shown, short: shortBy(shift.needed, people) }
}

const postInfo = (p) => ({ code: p.code, name: p.name, kind: p.kind, project: p.project })

// One week from its Monday: every post and shift with who is on each day
//   → { start, days, today, week, label, rows: [{ code, name, kind, project, shifts: [{ …shift, cells }] }], totals, canManage }
export async function rosterWeek(ctx, start) {
  start = weekStart(start)
  const days = weekDays(start)
  const today = todayKey()
  const [d, v] = await Promise.all([rosterData(ctx.db, days[0], days[6]), viewer(ctx)])
  const byDay = days.map((date) => assignments(d, date))
  let rows = d.posts.map((post) => ({
    ...postInfo(post),
    shifts: post.shifts.map((shift) => ({ ...shift, cells: days.map((date, i) => cell(d, byDay[i], post, shift, date, today, v)) })),
  }))
  if (!v.everything) rows = rows.map((p) => ({ ...p, shifts: p.shifts.filter((s) => s.cells.some((c) => c.people?.length)) })).filter((p) => p.shifts.length)
  const cells = rows.flatMap((p) => p.shifts.flatMap((s) => s.cells.filter((c) => c.applies)))
  const people = cells.flatMap((c) => c.people)
  return {
    start,
    days,
    today,
    week: isoWeek(start),
    label: weekLabel(start),
    rows,
    totals: {
      short: cells.reduce((n, c) => n + c.short, 0),
      shortShifts: cells.filter((c) => c.short).length,
      covers: people.filter((p) => p.cover).length,
      leave: new Set(people.filter((p) => p.status === "leave").map((p) => p.code)).size,
      absent: people.filter((p) => p.status === "absent").length,
      unmarked: people.filter((p) => p.status === "unmarked").length,
    },
    canManage: Boolean(ctx.grant("hr.roster")),
  }
}

// A day's attendance: every shift running that day with its people, and office staff (no
// full-time duties) Monday to Saturday → { date, today, duties, office, counts, canMark }
export async function attendanceDay(ctx, date) {
  const today = todayKey()
  const [d, v] = await Promise.all([rosterData(ctx.db, date, date), viewer(ctx)])
  const assigned = assignments(d, date)
  const duties = d.posts.flatMap((post) => post.shifts.map((shift) => ({ post: postInfo(post), shift, ...cell(d, assigned, post, shift, date, today, v) }))).filter((x) => x.applies && (v.everything || x.people.length))
  const onDuty = new Set(duties.flatMap((x) => x.people.map((p) => p.code)))
  const office = [...d.employees.values()]
    .filter((e) => e.status === "active" && employedOn(e, date) && officeDay(d.patterns, e.id, date) && !onDuty.has(e.code) && v.sees(e.id))
    .map((e) => person(d, { employeeId: e.id }, date, today))
  const everyone = new Map([...duties.flatMap((x) => x.people), ...office].map((p) => [p.code, p]))
  const count = (s) => [...everyone.values()].filter((p) => p.status === s).length
  return {
    date,
    today,
    duties,
    office,
    counts: { people: everyone.size, present: count("present"), late: count("late"), absent: count("absent"), leave: count("leave"), unmarked: count("unmarked") },
    canMark: Boolean(ctx.grant("hr.roster")) && date <= today,
  }
}

// Posts with their shifts (inactive ones too), and how many people have regular duties there
export async function listPosts(ctx) {
  const d = await rosterData(ctx.db, todayKey(), todayKey(), { all: true })
  return d.posts.map((p) => ({
    code: p.code,
    name: p.name,
    kind: p.kind,
    project: p.project,
    projectCode: d.projects.find((x) => x.id === p.projectId)?.code ?? null,
    shifts: p.shifts,
    isActive: p.isActive,
    people: new Set(d.patterns.filter((x) => x.postId === p.id).map((x) => x.employeeId)).size,
  }))
}

// Active employees this person can see, with their regular duties:
//   [{ code, name, designation, department, duties: [{ post (code), shiftKey, days, rotate, weeks }] }]
export async function listDuties(ctx) {
  const [employees, patterns, posts] = await Promise.all([
    scoped(ctx, live(ctx.db, "employees")).where({ status: "active" }).orderBy("name").select("id", "code", "name", "designation", "department"),
    ctx.db("dutyPatterns").orderBy("id").select("employeeId", "postId", "shiftKey", "days", "rotate", "weeks"),
    live(ctx.db, "dutyPosts").select("id", "code"),
  ])
  const codes = new Map(posts.map((p) => [p.id, p.code]))
  return employees.map((e) => ({
    code: e.code,
    name: e.name,
    designation: e.designation,
    department: e.department,
    duties: patterns
      .filter((p) => p.employeeId === e.id && codes.has(p.postId))
      .map((p) => ({ post: codes.get(p.postId), shiftKey: p.shiftKey, days: parse(p.days, []), rotate: Boolean(p.rotate), weeks: p.weeks || "" })),
  }))
}

// Active employees this person can see, for the cover picker → [{ code, name, designation }]
export const rosterStaff = (ctx) => scoped(ctx, live(ctx.db, "employees")).where({ status: "active" }).orderBy("name").select("code", "name", "designation")

// One person's duties for this week and next (My Desk › My roster):
//   → [{ date, post: { code, name, kind, project }, shift: { key, label, start, end }, status, cover }]
// employeeId: defaults to the signed-in person's own employee record
export async function myDuties(ctx, employeeId = ctx.me?.id, { from = weekStart(todayKey()), days = 14 } = {}) {
  if (!employeeId) return []
  const to = addDays(from, days - 1)
  const today = todayKey()
  const d = await rosterData(ctx.db, from, to)
  const e = d.employees.get(employeeId)
  if (!e) return []
  const out = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    if (!employedOn(e, date)) continue
    for (const [k, list] of assignments(d, date)) {
      const x = list.find((y) => y.employeeId === employeeId)
      if (!x) continue
      const [postId, shiftKey] = k.split(":")
      const post = d.posts.find((p) => p.id === Number(postId))
      const shift = post?.shifts.find((s) => s.key === shiftKey)
      if (!shift) continue
      const p = person(d, x, date, today)
      out.push({ date, post: postInfo(post), shift: { key: shift.key, label: shift.label, start: shift.start, end: shift.end }, status: p.status, cover: p.cover })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.shift.start.localeCompare(b.shift.start))
}
