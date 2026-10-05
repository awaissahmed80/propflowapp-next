"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { writeSettings } from "@/modules/portal/server/setup"
import { createApproval, pendingFor, closeApproval } from "@/modules/approvals/server/requests"
import { financeContext } from "@/modules/finance/server/context"
import { PostingError, postLoanGiven } from "@/modules/finance/server/posting"
import { ADVANCE_MAX_MONTHS, installmentFor, leaveDays, monthlyGross, nextMonth } from "../constants"
import { hrAction, hrContext, scoped } from "./context"
import { RULES_KEY, ensureDraft, rebuildDraft } from "./payroll"
import { payApprovedRun, settleLeave } from "./ops"

// HR & Payroll's own actions that need approvals: leave, loans and advances, and payroll runs.
// Following the workspace rule: people with the access act directly; anyone else's request goes to
// Approvals (leave → hr.approve-leave, advances → hr.loans, paying payroll → Finance approvers).

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date.")
const month = z.string().regex(/^\d{4}-\d{2}$/, "Pick the month.")
// A date as the day it is in Pakistan: "2026-10-04"
const pkDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d))
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "hr", action, actorUserId: ctx.user.id, summary })
const employeeBy = (ctx, code) =>
  scoped(ctx, live(ctx.db, "employees"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "name", "userId", "teamId", "salary", "status")
const NOT_FOUND = { error: "That employee was removed or isn't yours to see." }

// ---------- leave ----------

const leaveSchema = z
  .object({ employee: z.string().trim().optional().nullable(), type: z.string().trim().min(1, "Pick the leave type."), startOn: date, endOn: date, reason: z.string().trim().max(500).optional().default("") })
  .refine((v) => v.endOn >= v.startOn, { path: ["endOn"], message: "Ends before it starts." })

// Apply for leave: for yourself (My Desk), or for someone you can see (HR) → { ok, code, approved? }
// It waits in Approvals for someone with hr.approve-leave, unless the person applying for
// someone else can approve leave themselves.
export async function applyLeave(input) {
  const ctx = await hrContext()
  const parsed = leaveSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!isLookupValue((await getLookups(ctx.db, ["leave-type"]))["leave-type"], v.type)) return { fieldErrors: { type: "Pick the leave type." } }
  const forSelf = !v.employee
  const emp = forSelf ? (ctx.me ? await live(ctx.db, "employees").where({ id: ctx.me.id }).first("id", "code", "name", "userId") : null) : ctx.can("create") ? await employeeBy(ctx, v.employee) : null
  if (!emp) return forSelf ? { error: "You aren't on the payroll, so there's no leave to apply for." } : NOT_FOUND
  const days = leaveDays(v.startOn, v.endOn)
  if (await live(ctx.db, "leaveRequests").where({ employeeId: emp.id }).whereIn("status", ["pending", "approved"]).where("startOn", "<=", v.endOn).where("endOn", ">=", v.startOn).first("id"))
    return { fieldErrors: { startOn: "There's already leave on some of those days." } }
  const direct = !forSelf && ctx.grant("hr.approve-leave") && emp.userId !== ctx.user.id
  let code
  let id
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "leave")
    ;[id] = await trx("leaveRequests").insert({
      code,
      employeeId: emp.id,
      type: v.type,
      startOn: v.startOn,
      endOn: v.endOn,
      days,
      reason: v.reason || null,
      status: direct ? "approved" : "pending",
      ...(direct ? { decidedBy: ctx.user.id, decidedAt: new Date() } : {}),
      createdBy: ctx.user.id,
    })
  })
  if (!direct)
    await createApproval(ctx.db, {
      type: "leave",
      app: "hr",
      subjectType: "leave",
      subjectId: id,
      title: `${emp.name}: ${days} ${days === 1 ? "day" : "days"} of leave`,
      details: `${v.startOn} to ${v.endOn}${v.reason ? ` · ${v.reason}` : ""}`.slice(0, 255),
      link: "/hrm/leave",
      reason: v.reason || null,
      payload: { type: v.type },
      requestedBy: ctx.user.id,
    })
  await log(ctx, direct ? "leave.recorded" : "leave.requested", `${direct ? "recorded" : "asked for"} ${days} days of leave for ${emp.name} (${code})`)
  return { ok: true, code, approved: direct }
}

// Decide a leave request from HR's Leave page (same as deciding it in Approvals) → { ok } | { error }
export async function decideLeave(code, decision, note = "") {
  const { ctx, error } = await hrAction("view", "hr.approve-leave")
  if (error) return { error }
  const l = await live(ctx.db, "leaveRequests")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "employeeId", "status")
  if (!l || l.status !== "pending") return { error: "That request isn't waiting any more." }
  const emp = await scoped(ctx, live(ctx.db, "employees")).where({ id: l.employeeId }).first("id", "userId", "name")
  if (!emp) return { error: "That employee isn't yours to see." }
  if (emp.userId === ctx.user.id) return { error: "Someone else needs to decide your own leave." }
  if (decision === "rejected" && String(note).trim().length < 3) return { error: "Say why, so they know." }
  const a = await pendingFor(ctx.db, "leave", l.id)
  await ctx.db.transaction(async (trx) => {
    await settleLeave(trx, ctx, l, decision, note)
    if (a) await closeApproval(trx, a.id, { status: decision === "approved" ? "approved" : "rejected", userId: ctx.user.id, note: note || null })
  })
  return { ok: true }
}

// Withdraw your own leave request (or HR cancels one) → { ok } | { error }
export async function cancelLeave(code) {
  const ctx = await hrContext()
  const l = await live(ctx.db, "leaveRequests")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "employeeId", "status", "startOn")
  if (!l || !["pending", "approved"].includes(l.status)) return { error: "That leave can't be canceled." }
  const mine = ctx.me?.id === l.employeeId
  if (!mine && !(ctx.can("edit") && ctx.grant("hr.approve-leave"))) return { error: "Your role can't cancel others' leave." }
  if (mine && l.status === "approved" && pkDay(l.startOn) <= pkDay(new Date())) return { error: "It has started. Ask HR to change it." }
  const a = await pendingFor(ctx.db, "leave", l.id)
  await ctx.db.transaction(async (trx) => {
    await trx("leaveRequests").where({ id: l.id }).update({ status: "cancelled", updatedAt: new Date(), updatedBy: ctx.user.id })
    if (a) await closeApproval(trx, a.id, { status: "withdrawn", userId: ctx.user.id })
  })
  return { ok: true }
}

// ---------- loans and advances ----------

const loanSchema = z.object({
  employee: z.string().trim().optional().nullable(),
  kind: z.enum(["loan", "advance"]).default("advance"),
  amount: z.coerce.number().positive("Enter the amount.").max(100_000_000),
  months: z.coerce.number().int().min(1).max(60).default(1),
  reason: z.string().trim().max(500).optional().default(""),
  accountId: z.coerce.number().int().positive().optional().nullable(),
})

// Ask for a salary advance from My Desk → { ok, code } (waits in Approvals for hr.loans)
export async function requestAdvance(input) {
  const ctx = await hrContext()
  const parsed = loanSchema.safeParse({ ...input, kind: "advance", employee: null })
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!ctx.me) return { error: "You aren't on the payroll, so an advance can't be paid." }
  const emp = await live(ctx.db, "employees").where({ id: ctx.me.id }).first("id", "name", "salary", "status")
  const gross = monthlyGross(typeof emp.salary === "string" ? JSON.parse(emp.salary) : emp.salary)
  if (v.amount > gross) return { fieldErrors: { amount: `Up to one month's salary (${rs(gross)}).` } }
  if (v.months > ADVANCE_MAX_MONTHS) return { fieldErrors: { months: `Repaid over at most ${ADVANCE_MAX_MONTHS} months.` } }
  if (await live(ctx.db, "loans").where({ employeeId: emp.id }).whereIn("status", ["pending", "active"]).first("id")) return { error: "You already have an advance or loan open." }
  const out = await createLoan(ctx, emp, v, { pending: true })
  await createApproval(ctx.db, {
    type: "advance",
    app: "hr",
    subjectType: "loan",
    subjectId: out.id,
    title: `Salary advance ${rs(v.amount)} for ${emp.name}`,
    details: `Repaid over ${v.months} ${v.months === 1 ? "month" : "months"} (${rs(out.installment)} a month)`,
    amount: v.amount,
    link: "/hrm/loans",
    reason: v.reason || null,
    requestedBy: ctx.user.id,
  })
  return { ok: true, code: out.code, pending: true }
}

// HR gives a loan or advance directly (hr.loans): paid out now and posted to Finance → { ok, code }
export async function giveLoan(input) {
  const { ctx, error } = await hrAction("create", "hr.loans")
  if (error) return { error }
  const parsed = loanSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const emp = await employeeBy(ctx, v.employee)
  if (!emp || emp.status !== "active") return { fieldErrors: { employee: "Pick an active employee." } }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId, isActive: true }).whereIn("kind", ["cash", "bank"]).first("id"))) return { fieldErrors: { accountId: "Pick the account it's paid from." } }
  if (await live(ctx.db, "loans").where({ employeeId: emp.id }).whereIn("status", ["pending", "active"]).first("id")) return { error: `${emp.name} already has a loan or advance open.` }
  try {
    const out = await createLoan(ctx, emp, v, { pending: false })
    await log(ctx, "loan.given", `gave ${emp.name} a ${v.kind} of ${rs(v.amount)} (${out.code})`)
    return { ok: true, code: out.code }
  } catch (err) {
    if (err instanceof PostingError) return { error: err.message }
    throw err
  }
}

async function createLoan(ctx, emp, v, { pending }) {
  const installment = installmentFor(v.amount, v.months)
  const thisMonth = pkDay(new Date()).slice(0, 7)
  let out
  await ctx.db.transaction(async (trx) => {
    const code = await nextCode(trx, "loan")
    const [id] = await trx("loans").insert({
      code,
      employeeId: emp.id,
      kind: v.kind,
      amount: v.amount,
      installment,
      startMonth: nextMonth(thisMonth),
      reason: v.reason || null,
      status: pending ? "pending" : "active",
      accountId: v.accountId ?? null,
      givenAt: pending ? null : new Date(),
      approvedBy: pending ? null : ctx.user.id,
      createdBy: ctx.user.id,
    })
    if (!pending) await postLoanGiven(trx, ctx, id)
    out = { id, code, installment }
  })
  return out
}

// ---------- payroll ----------

const runBy = (ctx, code) =>
  live(ctx.db, "payrollRuns")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()

// Start (or rebuild) the draft for a month (hr.payroll) → { ok, code }
export async function refreshDraft(m) {
  const { ctx, error } = await hrAction("edit", "hr.payroll")
  if (error) return { error }
  const parsed = month.safeParse(m)
  if (!parsed.success) return { error: "Pick the month." }
  let run
  await ctx.db.transaction(async (trx) => {
    run = await ensureDraft(trx, parsed.data, ctx.user.id)
    if (run.status === "draft") await rebuildDraft(trx, run.id)
  })
  if (run.status !== "draft") return { error: `${run.code} is already ${run.status}.` }
  return { ok: true, code: run.code }
}

const adjustSchema = z.object({
  employee: z.string().trim().min(1),
  bonus: z.coerce.number().min(0).max(100_000_000).default(0),
  otherDeduction: z.coerce.number().min(0).max(100_000_000).default(0),
  extraUnpaidDays: z.coerce.number().min(0).max(31).default(0),
  note: z.string().trim().max(300).optional().default(""),
})

// Change one employee's line on a draft: bonus/overtime, other deductions, extra unpaid days, note
export async function adjustPayrollLine(runCode, input) {
  const { ctx, error } = await hrAction("edit", "hr.payroll")
  if (error) return { error }
  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const run = await runBy(ctx, runCode)
  if (!run || run.status !== "draft") return { error: "Only a draft run can be changed." }
  const emp = await live(ctx.db, "employees").where({ code: v.employee.toUpperCase() }).first("id")
  if (!emp) return { error: "That employee was removed." }
  await ctx.db.transaction(async (trx) => {
    await trx("payrollLines")
      .where({ runId: run.id, employeeId: emp.id })
      .update({ bonus: v.bonus, otherDeduction: v.otherDeduction, extraUnpaidDays: v.extraUnpaidDays, note: v.note || null })
    await rebuildDraft(trx, run.id)
  })
  return { ok: true }
}

// Approve a draft (hr.payroll), or send an approved run back to draft → { ok } | { error }
export async function setRunStatus(runCode, status) {
  const { ctx, error } = await hrAction("edit", "hr.payroll")
  if (error) return { error }
  const run = await runBy(ctx, runCode)
  if (!run) return { error: "That payroll run was removed." }
  if (status === "approved") {
    if (run.status !== "draft") return { error: "Only a draft can be approved." }
    await ctx.db.transaction(async (trx) => {
      await rebuildDraft(trx, run.id)
      await trx("payrollRuns").where({ id: run.id }).update({ status: "approved", approvedBy: ctx.user.id, approvedAt: new Date(), updatedAt: new Date(), updatedBy: ctx.user.id })
    })
    await log(ctx, "payroll.approved", `approved payroll ${run.code}`)
    return { ok: true }
  }
  if (status === "draft") {
    if (run.status !== "approved") return { error: "Only an approved run can go back to draft." }
    if (await pendingFor(ctx.db, "payroll_run", run.id)) return { error: "Its payment is waiting for approval. Withdraw that first." }
    await ctx.db("payrollRuns").where({ id: run.id }).update({ status: "draft", approvedBy: null, approvedAt: null, updatedAt: new Date(), updatedBy: ctx.user.id })
    return { ok: true }
  }
  return { error: "Approve, or back to draft?" }
}

// Pay an approved run: posts the salaries to Finance. Finance approvers (finance.approve) pay
// directly; anyone else with Finance create (or hr.payroll) sends it to Approvals.
//   accountId: the bank the transfers are paid from
export async function payRun(runCode, { accountId = null, reason = "" } = {}) {
  const hr = await hrContext()
  const fin = await financeContext()
  if (!(hr.grant("hr.payroll") || fin.can("create"))) return { error: "Your role can't pay payroll." }
  const run = await runBy(hr, runCode)
  if (!run || run.status !== "approved") return { error: "Only an approved run can be paid." }
  if (accountId && !(await live(hr.db, "accounts").where({ id: accountId, isActive: true }).whereIn("kind", ["cash", "bank"]).first("id"))) return { error: "Pick the account it's paid from." }
  if (!fin.can("approve")) {
    if (await pendingFor(hr.db, "payroll_run", run.id)) return { error: "It's already waiting for approval." }
    await createApproval(hr.db, {
      type: "payroll-payment",
      app: "hr",
      subjectType: "payroll_run",
      subjectId: run.id,
      title: `Pay salaries ${run.code} (${rs(run.net)})`,
      details: `${run.people} people`,
      amount: Number(run.net),
      link: `/hrm/payroll/${run.code.toLowerCase()}`,
      reason: String(reason ?? "").trim() || null,
      payload: { accountId },
      requestedBy: hr.user.id,
    })
    return { ok: true, pending: true }
  }
  try {
    await hr.db.transaction((trx) => payApprovedRun(trx, hr, run, accountId))
  } catch (err) {
    if (err instanceof PostingError) return { error: err.message }
    throw err
  }
  await log(hr, "payroll.paid", `paid payroll ${run.code} (${rs(run.net)})`)
  return { ok: true }
}

// ---------- rules ----------

const rulesSchema = z.object({
  taxYear: z.string().trim().min(4).max(10),
  slabs: z.array(z.object({ upTo: z.coerce.number().positive().nullable(), fixed: z.coerce.number().min(0), rate: z.coerce.number().min(0).max(100) })).min(1),
  minimumWage: z.coerce.number().min(0),
  eobiEmployeePct: z.coerce.number().min(0).max(100),
  eobiEmployerPct: z.coerce.number().min(0).max(100),
  pfEmployeePct: z.coerce.number().min(0).max(100),
  pfEmployerPct: z.coerce.number().min(0).max(100),
  medicalExemptPct: z.coerce.number().min(0).max(100),
  leave: z.object({ annual: z.coerce.number().int().min(0).max(60), casual: z.coerce.number().int().min(0).max(60), sick: z.coerce.number().int().min(0).max(60) }),
})

// Payroll rules (hr.payroll): tax slabs, EOBI, provident fund, medical exemption, leave allowances
export async function savePayrollRules(input) {
  const { ctx, error } = await hrAction("edit", "hr.payroll")
  if (error) return { error }
  const parsed = rulesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const slabs = parsed.data.slabs
  if (slabs.some((s, i) => i < slabs.length - 1 && (s.upTo == null || (i && s.upTo <= slabs[i - 1].upTo)))) return { error: "Slabs must go up in order, with only the last one open-ended." }
  await writeSettings(ctx.tenant, { [RULES_KEY]: parsed.data }, ctx.user.id)
  await log(ctx, "rules.saved", `changed the payroll rules (${parsed.data.taxYear})`)
  return { ok: true }
}
