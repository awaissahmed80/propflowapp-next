import "server-only"
import { mergeRules, monthRange, monthlyGross, nextMonth, payslip } from "../constants"

// Payroll runs: one per month, draft → approved → paid. A draft is (re)built from the employees
// active that month, their unpaid leave and absences, and the loans being recovered; amounts entered
// by hand on the draft (bonus, other deductions, extra unpaid days, note) are kept across rebuilds.
//   trx: a transaction (or db) · month: "2026-10"

export const RULES_KEY = "hr_rules"

export async function hrRules(db) {
  const row = await db("settings").where({ key: RULES_KEY }).first("value")
  const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value
  return mergeRules(v)
}

const day = (d) => new Date(d).toISOString().slice(0, 10)

// Days between two dates that fall inside a month (both included)
function overlap(start, end, month) {
  const { start: ms, end: me } = monthRange(month)
  const a = Math.max(new Date(`${day(start)}T00:00:00Z`), ms)
  const b = Math.min(new Date(`${day(end)}T00:00:00Z`), me)
  return b < a ? 0 : Math.round((b - a) / 86_400_000) + 1
}

// What's left of each active loan, after recoveries in paid runs
export async function loansLeft(trx, employeeIds) {
  if (!employeeIds.length) return []
  const loans = await trx("loans").whereIn("employeeId", employeeIds).where({ status: "active" }).whereNull("deletedAt").select("id", "code", "employeeId", "amount", "installment", "startMonth")
  if (!loans.length) return []
  const lines = await trx("payrollLines as l").join("payrollRuns as r", "r.id", "l.runId").where("r.status", "paid").whereIn("l.employeeId", employeeIds).whereNotNull("l.loans").select("l.loans")
  const recovered = new Map()
  for (const l of lines) for (const x of typeof l.loans === "string" ? JSON.parse(l.loans) : (l.loans ?? [])) recovered.set(x.loanId, (recovered.get(x.loanId) ?? 0) + Number(x.amount))
  return loans.map((l) => ({ ...l, recovered: recovered.get(l.id) ?? 0, left: Math.max(0, Number(l.amount) - (recovered.get(l.id) ?? 0)) }))
}

// The draft for a month, created if missing → run row
export async function ensureDraft(trx, month, userId = null) {
  const existing = await trx("payrollRuns").where({ month }).whereNull("deletedAt").first()
  if (existing) return existing
  await trx("payrollRuns").insert({ code: `PR-${month}`, month, status: "draft", createdBy: userId })
  return trx("payrollRuns").where({ month }).first()
}

// Rebuild a draft's lines from current employees, leave, attendance and loans → totals
export async function rebuildDraft(trx, runId) {
  const run = await trx("payrollRuns").where({ id: runId }).forUpdate().first()
  if (!run || run.status !== "draft") throw new Error("Only a draft can be rebuilt.")
  const rules = await hrRules(trx)
  const { start, end } = monthRange(run.month)
  const employees = await trx("employees")
    .whereNull("deletedAt")
    .where("joinedOn", "<=", day(end))
    .where((q) => q.whereNull("leftOn").orWhere("leftOn", ">=", day(start)))
    .select("id", "salary", "pf", "joinedOn", "leftOn", "payMethod", "employmentType")
  const ids = employees.map((e) => e.id)
  const [kept, leave, absences, loans] = await Promise.all([
    trx("payrollLines").where({ runId }).select("employeeId", "bonus", "otherDeduction", "extraUnpaidDays", "note"),
    ids.length
      ? trx("leaveRequests")
          .whereIn("employeeId", ids)
          .where({ status: "approved" })
          .whereNull("deletedAt")
          .where("startOn", "<=", day(end))
          .where("endOn", ">=", day(start))
          .select("employeeId", "type", "startOn", "endOn")
      : [],
    ids.length
      ? trx("attendance")
          .whereIn("employeeId", ids)
          .where({ status: "absent" })
          .whereBetween("onDate", [day(start), day(end)])
          .select("employeeId", "onDate")
      : [],
    loansLeft(trx, ids),
  ])
  const keep = new Map(kept.map((k) => [k.employeeId, k]))
  await trx("payrollLines").where({ runId }).delete()
  const totals = { gross: 0, deductions: 0, net: 0, people: 0 }
  for (const e of employees) {
    const salary = typeof e.salary === "string" ? JSON.parse(e.salary) : e.salary
    // No salary set yet (added before HR filled it in): nothing to pay
    if (!monthlyGross(salary)) continue
    const k = keep.get(e.id) ?? {}
    const mine = leave.filter((l) => l.employeeId === e.id)
    const unpaidLeave = mine.filter((l) => l.type === "unpaid").reduce((s, l) => s + overlap(l.startOn, l.endOn, run.month), 0)
    // An absence on a day of approved leave isn't counted again
    const onLeave = (d) => mine.some((l) => day(l.startOn) <= day(d) && day(d) <= day(l.endOn))
    const absent = absences.filter((a) => a.employeeId === e.id && !onLeave(a.onDate)).length
    const extra = Number(k.extraUnpaidDays ?? 0)
    const p = payslip({
      employee: { salary: typeof e.salary === "string" ? JSON.parse(e.salary) : e.salary, pf: Boolean(e.pf), joinedOn: e.joinedOn, leftOn: e.leftOn, payMethod: e.payMethod, employmentType: e.employmentType },
      rules,
      month: run.month,
      unpaidDays: unpaidLeave + absent + extra,
      bonus: Number(k.bonus ?? 0),
      otherDeduction: Number(k.otherDeduction ?? 0),
      loans: loans.filter((l) => l.employeeId === e.id && l.startMonth <= run.month && l.left > 0),
    })
    if (!p.employedDays) continue
    await trx("payrollLines").insert({
      runId,
      employeeId: e.id,
      earnings: JSON.stringify(p.earnings),
      gross: p.gross,
      unpaidDays: p.unpaidDays,
      extraUnpaidDays: extra,
      unpaidDeduction: p.unpaidDeduction,
      bonus: p.bonus,
      otherDeduction: p.otherDeduction,
      taxable: p.taxable,
      tax: p.tax,
      eobi: p.eobi,
      eobiEmployer: p.eobiEmployer,
      pf: p.pf,
      pfEmployer: p.pfEmployer,
      loan: p.loan,
      loans: JSON.stringify(p.loans),
      net: p.net,
      payMethod: p.payMethod,
      note: k.note ?? null,
    })
    totals.gross += p.gross + p.bonus
    totals.deductions += p.unpaidDeduction + p.tax + p.eobi + p.pf + p.loan + p.otherDeduction
    totals.net += p.net
    totals.people += 1
  }
  await trx("payrollRuns")
    .where({ id: runId })
    .update({ ...totals, updatedAt: new Date() })
  return totals
}

// After a run is paid: loans fully recovered are closed, and next month's draft is started
export async function afterPaid(trx, run, userId) {
  const lines = await trx("payrollLines").where({ runId: run.id }).select("employeeId")
  const left = await loansLeft(
    trx,
    lines.map((l) => l.employeeId),
  )
  const done = left.filter((l) => l.left <= 0).map((l) => l.id)
  if (done.length) await trx("loans").whereIn("id", done).update({ status: "closed", updatedAt: new Date() })
  const next = await ensureDraft(trx, nextMonth(run.month), userId)
  if (next.status === "draft") await rebuildDraft(trx, next.id)
}
