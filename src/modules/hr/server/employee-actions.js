"use server"

import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { normalizePhone } from "@/lib/phone"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { ensureContact, linkContact, relinkContact } from "@/modules/contacts/server/links"
import { listMembers } from "@/modules/users/server/queries"
import { SALARY_PARTS, OWNER_TYPES, monthlyGross } from "../constants"
import { hrAction, scoped } from "./context"
import { hrRules } from "./payroll"

// Employees: add and edit (hr create / edit; salary parts only with hr.salaries), end employment,
// link a portal login, and add everyone in Users & Teams who isn't on the payroll yet.
// Every employee is linked to a central contact (role "employee"), matched by mobile.

const rs = (v) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(v))}`
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const text = (max) => z.string().trim().max(max).optional().nullable().default("")
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date.")
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "hr", action, actorUserId: ctx.user.id, summary })
const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
const NOT_FOUND = { error: "That employee was removed or isn't yours to see." }

const employeeSchema = z.object({
  name: z.string().trim().min(2, "Their name, as on the CNIC.").max(150),
  gender: z.enum(["male", "female"]).optional().nullable(),
  guardianRelation: z.enum(["S/O", "D/O", "W/O"]).optional().nullable(),
  guardianName: text(150),
  // undefined: keep the stored one (it's masked for roles without contacts.cnic)
  cnic: z
    .string()
    .trim()
    .regex(/^(\d{5}-\d{7}-\d)?$/, "CNIC like 35202-1234567-1.")
    .optional(),
  phone: text(30),
  email: z.string().trim().email("Check the email.").max(150).or(z.literal("")).optional().nullable().default(""),
  dateOfBirth: date.or(z.literal("")).optional().nullable(),
  designation: z.string().trim().min(1, "Pick the designation.").max(50),
  department: z.string().trim().min(1, "Pick the department.").max(50),
  teamId: z.coerce.number().int().positive().optional().nullable(),
  project: text(10), // project code; empty: head office
  employmentType: z.string().trim().min(1, "Pick how they're employed.").max(20),
  joinedOn: date,
  eobiNo: text(30),
  ntn: text(20),
  address: text(300),
  emergency: z
    .object({ name: text(150), relation: text(40), phone: text(30) })
    .optional()
    .nullable(),
  notes: text(500),
  // Pay (only taken with hr.salaries)
  salary: z.object(Object.fromEntries(SALARY_PARTS.map((p) => [p.key, z.coerce.number().min(0, "0 or more.").max(100_000_000).default(0)]))).optional(),
  pf: z.boolean().optional(),
  payMethod: z.enum(["bank", "cash"]).optional(),
  bankName: text(100),
  accountTitle: text(150),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .refine((v) => !v || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), "IBAN like PK36SCBL0000001123456702.")
    .optional()
    .nullable(),
})

// Add (code empty) or change an employee → { ok, code } | { error } | { fieldErrors }
export async function saveEmployee(code, input) {
  const { ctx, error } = await hrAction(code ? "edit" : "create")
  if (error) return { error }
  const parsed = employeeSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const existing = code
    ? await scoped(ctx, live(ctx.db, "employees"))
        .where({ "employees.code": String(code).toUpperCase() })
        .first("employees.id", "employees.code", "employees.name", "employees.userId", "employees.contactId", "employees.phone", "employees.salary", "employees.status")
    : null
  if (code && !existing) return NOT_FOUND
  const lists = await getLookups(ctx.db, ["designation", "department", "employment-type"])
  if (!isLookupValue(lists.designation, v.designation)) return { fieldErrors: { designation: "Pick the designation." } }
  if (!isLookupValue(lists.department, v.department)) return { fieldErrors: { department: "Pick the department." } }
  if (!isLookupValue(lists["employment-type"], v.employmentType)) return { fieldErrors: { employmentType: "Pick how they're employed." } }

  const phone = v.phone ? (normalizePhone(v.phone) ?? null) : null
  if (v.phone && !phone) return { fieldErrors: { phone: "A mobile like 0300 1234567." } }
  if (v.teamId && !(await live(ctx.db, "teams").where({ id: v.teamId }).first("id"))) return { fieldErrors: { teamId: "Pick a team." } }
  const project = v.project ? await live(ctx.db, "projects").where({ code: v.project.toUpperCase() }).first("id") : null
  if (v.project && !project) return { fieldErrors: { project: "Pick a project." } }
  if (v.cnic) {
    const clash = await live(ctx.db, "employees")
      .where({ cnic: v.cnic, status: "active" })
      .whereNot({ id: existing?.id ?? 0 })
      .first("code", "name")
    if (clash) return { fieldErrors: { cnic: `${clash.name} (${clash.code}) has this CNIC.` } }
  }

  // Pay: set only by hr.salaries; anyone else keeps what's there (a new employee starts at zero)
  const paySet = Boolean(ctx.grant("hr.salaries")) && v.salary !== undefined
  const salary = paySet ? Object.fromEntries(SALARY_PARTS.map((p) => [p.key, Math.round(v.salary[p.key] ?? 0)])) : null
  if (paySet && !["daily-wage", ...OWNER_TYPES].includes(v.employmentType)) {
    const rules = await hrRules(ctx.db)
    const gross = monthlyGross(salary)
    if (gross < rules.minimumWage) return { fieldErrors: { "salary.basic": `Below the minimum wage of ${rs(rules.minimumWage)} a month (gross ${rs(gross)}).` } }
  }
  if (paySet && (v.payMethod ?? "bank") === "bank" && !v.iban && !v.bankName) return { fieldErrors: { bankName: "The bank they're paid into, or pick cash." } }

  const row = {
    name: v.name,
    gender: v.gender ?? null,
    guardianRelation: v.guardianRelation ?? null,
    guardianName: v.guardianName || null,
    ...(v.cnic !== undefined ? { cnic: v.cnic || null } : {}),
    phone,
    email: v.email || null,
    dateOfBirth: v.dateOfBirth || null,
    designation: v.designation,
    department: v.department,
    teamId: v.teamId ?? null,
    projectId: project?.id ?? null,
    employmentType: v.employmentType,
    joinedOn: v.joinedOn,
    eobiNo: v.eobiNo || null,
    ntn: v.ntn || null,
    address: v.address || null,
    emergency: v.emergency && (v.emergency.name || v.emergency.phone) ? JSON.stringify({ name: v.emergency.name || "", relation: v.emergency.relation || "", phone: v.emergency.phone || "" }) : null,
    notes: v.notes || null,
    ...(paySet
      ? {
          salary: JSON.stringify(salary),
          pf: Boolean(v.pf),
          payMethod: v.payMethod ?? "bank",
          bankName: v.payMethod === "cash" ? null : v.bankName || null,
          accountTitle: v.payMethod === "cash" ? null : v.accountTitle || null,
          iban: v.payMethod === "cash" ? null : v.iban || null,
        }
      : {}),
  }
  if (!existing && !paySet) row.salary = JSON.stringify(Object.fromEntries(SALARY_PARTS.map((p) => [p.key, 0])))

  let out = existing?.code
  await ctx.db.transaction(async (trx) => {
    if (existing) {
      await trx("employees")
        .where({ id: existing.id })
        .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
      // The contact follows the mobile: a new number may be someone already in contacts
      if (!existing.contactId || (phone && phone !== existing.phone)) {
        const contactId = await ensureContact(trx, { name: v.name, phone, email: v.email || null }, ctx.user.id)
        await relinkContact(trx, contactId, { type: "employee", id: existing.id, role: "employee" }, ctx.user.id)
        await trx("employees").where({ id: existing.id }).update({ contactId })
      }
    } else {
      out = await nextCode(trx, "employee")
      const [id] = await trx("employees").insert({ ...row, code: out, status: "active", createdBy: ctx.user.id })
      const contactId = await ensureContact(trx, { name: v.name, phone, email: v.email || null }, ctx.user.id)
      await linkContact(trx, contactId, { type: "employee", id, role: "employee" }, ctx.user.id)
      await trx("employees").where({ id }).update({ contactId })
    }
  })
  await log(ctx, existing ? "employee.updated" : "employee.created", `${existing ? "updated" : "added"} employee ${v.name} (${out})`)
  return { ok: true, code: out }
}

const endSchema = z.object({ lastDay: date, reason: z.string().trim().min(3, "Say why, e.g. resigned.").max(300) })

// End someone's employment: their last working day and why. Their portal login is left as it is
// (removed in Users & Teams); payroll pays them up to the last day. → { ok } | { error } | { fieldErrors }
export async function endEmployment(code, input) {
  const { ctx, error } = await hrAction("edit")
  if (error) return { error }
  const parsed = endSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const e = await scoped(ctx, live(ctx.db, "employees"))
    .where({ "employees.code": String(code ?? "").toUpperCase() })
    .first("employees.id", "employees.code", "employees.name", "employees.userId", "employees.status", "employees.joinedOn")
  if (!e) return NOT_FOUND
  if (e.status !== "active") return { error: `${e.name} has already left.` }
  if (e.userId === ctx.user.id) return { error: "Someone else needs to end your own employment." }
  const joined = e.joinedOn instanceof Date ? e.joinedOn.toISOString().slice(0, 10) : String(e.joinedOn).slice(0, 10)
  if (v.lastDay < joined) return { fieldErrors: { lastDay: "That's before they joined." } }
  await ctx.db.transaction(async (trx) => {
    await trx("employees").where({ id: e.id }).update({ status: "left", leftOn: v.lastDay, endReason: v.reason, updatedAt: new Date(), updatedBy: ctx.user.id })
    // Leave asked for after the last day no longer applies
    await trx("leaveRequests").where({ employeeId: e.id, status: "pending" }).where("startOn", ">", v.lastDay).whereNull("deletedAt").update({ status: "cancelled", updatedAt: new Date(), updatedBy: ctx.user.id })
  })
  await log(ctx, "employee.ended", `ended ${e.name}'s employment (${e.code}), last day ${v.lastDay}`)
  return { ok: true }
}

// Link an employee to a workspace member's portal login, or unlink it (userId null) → { ok } | { error }
export async function linkLogin(employeeCode, userId) {
  const { ctx, error } = await hrAction("edit")
  if (error) return { error }
  const e = await scoped(ctx, live(ctx.db, "employees"))
    .where({ "employees.code": String(employeeCode ?? "").toUpperCase() })
    .first("employees.id", "employees.code", "employees.name", "employees.userId")
  if (!e) return NOT_FOUND
  if (userId == null) {
    if (!e.userId) return { ok: true }
    await ctx.db("employees").where({ id: e.id }).update({ userId: null, updatedAt: new Date(), updatedBy: ctx.user.id })
    await log(ctx, "employee.login_unlinked", `unlinked ${e.name}'s portal login (${e.code})`)
    return { ok: true }
  }
  const id = Number(userId)
  const member = await authDb()("memberships").where({ userId: id, tenantId: ctx.tenant.id, status: "active" }).whereNull("deletedAt").first("id")
  if (!member) return { error: "Pick someone in this workspace." }
  const other = await live(ctx.db, "employees").where({ userId: id }).whereNot({ id: e.id }).first("code", "name")
  if (other) return { error: `That login is already linked to ${other.name} (${other.code}).` }
  await ctx.db("employees").where({ id: e.id }).update({ userId: id, updatedAt: new Date(), updatedBy: ctx.user.id })
  await log(ctx, "employee.login_linked", `linked ${e.name}'s portal login (${e.code})`)
  return { ok: true }
}

// One click: an employee record for everyone in Users & Teams who doesn't have one (dealers
// left out), with their name, mobile, designation, department, team and joining date. Pay is
// filled in afterwards. → { ok, added }
export async function addFromMembers() {
  const { ctx, error } = await hrAction("create")
  if (error) return { error }
  const [members, taken, lists] = await Promise.all([listMembers(ctx), live(ctx.db, "employees").whereNotNull("userId").select("userId"), getLookups(ctx.db, ["designation", "department", "employment-type"])])
  const has = new Set(taken.map((t) => t.userId))
  const todo = members.filter((m) => m.status === "active" && !m.dealerId && !has.has(m.id))
  if (!todo.length) return { ok: true, added: 0 }
  const first = (list) => lists[list].find((x) => x.isActive)?.value ?? null
  const pick = (list, value) => (value && isLookupValue(lists[list], value) ? value : first(list))
  const type = isLookupValue(lists["employment-type"], "permanent") ? "permanent" : first("employment-type")
  const zero = JSON.stringify(Object.fromEntries(SALARY_PARTS.map((p) => [p.key, 0])))
  await ctx.db.transaction(async (trx) => {
    for (const m of todo) {
      const code = await nextCode(trx, "employee")
      const joined = m.joinedAt ? new Date(m.joinedAt).toISOString().slice(0, 10) : pkToday()
      const phone = m.phone ? (normalizePhone(m.phone) ?? null) : null
      const [id] = await trx("employees").insert({
        code,
        userId: m.id,
        name: m.name,
        phone,
        email: m.email,
        designation: pick("designation", m.designation),
        department: pick("department", m.department),
        teamId: m.teamId ?? null,
        employmentType: type,
        joinedOn: joined,
        status: "active",
        salary: zero,
        createdBy: ctx.user.id,
      })
      const contactId = await ensureContact(trx, { name: m.name, phone, email: m.email }, ctx.user.id)
      await linkContact(trx, contactId, { type: "employee", id, role: "employee" }, ctx.user.id)
      await trx("employees").where({ id }).update({ contactId })
    }
  })
  await log(ctx, "employee.added_from_members", `added ${todo.length} ${todo.length === 1 ? "member" : "members"} to the payroll`)
  return { ok: true, added: todo.length }
}
