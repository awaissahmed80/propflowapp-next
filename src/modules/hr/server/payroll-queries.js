import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { labelOf } from "@/modules/lookups/options"
import { peopleByIds } from "@/modules/users/server/queries"
import { pendingFor } from "@/modules/approvals/server/requests"

// Payroll pages' reads: the runs, one run with its payslip lines, and an employee's own payslips.
// Amounts only go to the browser for people who may see pay (hr.salaries), or for their own slip.

// What this person may do with payroll: open the pages, see amounts, build / approve runs
export const payrollAccess = (ctx) => ({
  open: ctx.can("view") && ctx.has("payroll") && Boolean(ctx.grant("hr.payroll") || ctx.grant("hr.salaries")),
  amounts: Boolean(ctx.grant("hr.salaries")),
  manage: ctx.can("edit") && Boolean(ctx.grant("hr.payroll")),
})

const json = (v) => (typeof v === "string" ? JSON.parse(v) : (v ?? null))
const n = (v) => Number(v ?? 0)
const MONEY = ["gross", "unpaidDeduction", "bonus", "otherDeduction", "taxable", "tax", "eobi", "eobiEmployer", "pf", "pfEmployer", "loan", "net"]

// Every run, newest month first → [{ code, month, status, people, gross, deductions, net, paidAt, pending }]
export async function listRuns(ctx, { amounts = true } = {}) {
  const runs = await live(ctx.db, "payrollRuns").orderBy("month", "desc").select("id", "code", "month", "status", "people", "gross", "deductions", "net", "approvedAt", "paidAt")
  const waiting = new Set(
    (
      await live(ctx.db, "approvals")
        .where({ subjectType: "payroll_run", status: "pending" })
        .whereIn(
          "subjectId",
          runs.map((r) => r.id),
        )
        .select("subjectId")
    ).map((a) => a.subjectId),
  )
  return runs.map((r) => ({
    code: r.code,
    month: r.month,
    status: r.status,
    pending: waiting.has(r.id),
    people: r.people,
    gross: amounts ? n(r.gross) : null,
    deductions: amounts ? n(r.deductions) : null,
    net: amounts ? n(r.net) : null,
    approvedAt: r.approvedAt,
    paidAt: r.paidAt,
  }))
}

// A line as the pages and payslips use it
function lineOut(l, lists, amounts) {
  const employee = {
    code: l.empCode,
    name: l.name,
    designation: labelOf(lists.designation, l.designation) ?? l.designation,
    department: labelOf(lists.department, l.department) ?? l.department,
    cnic: l.cnic,
    eobiNo: l.eobiNo,
    ntn: l.ntn,
    bankName: l.bankName,
    accountTitle: l.accountTitle,
    iban: amounts ? l.iban : null,
    joinedOn: l.joinedOn,
    leftOn: l.leftOn,
  }
  const out = { employee, payMethod: l.payMethod, unpaidDays: n(l.unpaidDays), extraUnpaidDays: n(l.extraUnpaidDays), note: l.note }
  if (!amounts) return out
  for (const k of MONEY) out[k] = n(l[k])
  return { ...out, earnings: json(l.earnings) ?? {}, loans: json(l.loans) ?? [] }
}

const LINE_COLUMNS = ["l.*", "e.code as empCode", "e.name", "e.designation", "e.department", "e.cnic", "e.eobiNo", "e.ntn", "e.bankName", "e.accountTitle", "e.iban", "e.joinedOn", "e.leftOn", "e.userId"]

// One run by its code (PR-2026-10) with its lines, who approved and paid it, the Finance
// voucher it posted and a payment waiting in Approvals → null when there's no such run
export async function getRun(ctx, code, { amounts = true } = {}) {
  const run = await live(ctx.db, "payrollRuns")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!run) return null
  const [lines, lists, voucher, pending, account] = await Promise.all([
    ctx.db("payrollLines as l").join("employees as e", "e.id", "l.employeeId").where("l.runId", run.id).orderBy("e.name").select(LINE_COLUMNS),
    getLookups(ctx.db, ["designation", "department"]),
    live(ctx.db, "vouchers").where({ sourceType: "payroll_run", sourceId: run.id }).whereIn("status", ["posted", "pending"]).orderBy("id", "desc").first("code", "status"),
    pendingFor(ctx.db, "payroll_run", run.id),
    run.accountId ? ctx.db("accounts").where({ id: run.accountId }).first("code", "name") : null,
  ])
  const people = await peopleByIds([run.approvedBy, run.paidBy, pending?.requestedBy])
  const out = lines.map((l) => lineOut(l, lists, amounts))
  const sum = (k, f = () => true) => out.filter(f).reduce((s, l) => s + n(l[k]), 0)
  return {
    code: run.code,
    month: run.month,
    status: run.status,
    people: run.people,
    notes: run.notes,
    approvedAt: run.approvedAt,
    approvedBy: people.get(run.approvedBy)?.name ?? null,
    paidAt: run.paidAt,
    paidBy: people.get(run.paidBy)?.name ?? null,
    account: account ? { code: account.code, name: account.name } : null,
    voucher: voucher ? { code: voucher.code, status: voucher.status } : null,
    pending: pending ? { code: pending.code, by: people.get(pending.requestedBy)?.name ?? null, at: pending.createdAt } : null,
    totals: amounts
      ? {
          gross: n(run.gross),
          deductions: n(run.deductions),
          net: n(run.net),
          tax: sum("tax"),
          eobi: sum("eobi"),
          pf: sum("pf"),
          loan: sum("loan"),
          unpaid: sum("unpaidDeduction"),
          other: sum("otherDeduction"),
          bonus: sum("bonus"),
          employer: sum("eobiEmployer") + sum("pfEmployer"),
          bank: sum("net", (l) => l.payMethod !== "cash"),
          cash: sum("net", (l) => l.payMethod === "cash"),
        }
      : null,
    lines: out,
  }
}

// One person's payslip from a run, for their own My Pay (paid runs only) → { run, slip } | null
export async function ownPayslip(ctx, runCode, employeeId) {
  const run = await live(ctx.db, "payrollRuns")
    .where({ code: String(runCode ?? "").toUpperCase(), status: "paid" })
    .first("id", "code", "month", "status", "paidAt")
  if (!run) return null
  const [l, lists] = await Promise.all([
    ctx.db("payrollLines as l").join("employees as e", "e.id", "l.employeeId").where({ "l.runId": run.id, "l.employeeId": employeeId }).first(LINE_COLUMNS),
    getLookups(ctx.db, ["designation", "department"]),
  ])
  if (!l) return null
  return { run: { code: run.code, month: run.month, status: run.status, paidAt: run.paidAt }, slip: lineOut(l, lists, true) }
}

// An employee's payslips from paid runs, newest first → [{ run: { code, month, paidAt }, slip }]
export async function payslipsFor(ctx, employeeId) {
  const [rows, lists] = await Promise.all([
    ctx
      .db("payrollLines as l")
      .join("payrollRuns as r", "r.id", "l.runId")
      .join("employees as e", "e.id", "l.employeeId")
      .where({ "l.employeeId": employeeId, "r.status": "paid" })
      .whereNull("r.deletedAt")
      .orderBy("r.month", "desc")
      .select([...LINE_COLUMNS, "r.code as runCode", "r.month as runMonth", "r.paidAt as runPaidAt"]),
    getLookups(ctx.db, ["designation", "department"]),
  ])
  return rows.map((l) => ({ run: { code: l.runCode, month: l.runMonth, paidAt: l.runPaidAt, status: "paid" }, slip: lineOut(l, lists, true) }))
}

// Bank accounts salaries can be paid from, the workspace's default first
export const payrollAccounts = (ctx) =>
  live(ctx.db, "accounts").where({ kind: "bank", isActive: true }).orderBy("isDefault", "desc").orderBy("sortOrder").orderBy("code").select("id", "code", "name", "bankName", "isDefault")

// Payslips to print or download: a whole run (or one person in it) for people who see pay,
// or someone's own payslip from a paid run → { run, slips } | null
//   employeeCode: "emp-00001" or null for everyone in the run
export async function payslipsToPrint(ctx, runCode, employeeCode = null) {
  const access = payrollAccess(ctx)
  const wanted = employeeCode ? String(employeeCode).toUpperCase() : null
  if (access.open && access.amounts) {
    const run = await getRun(ctx, runCode)
    if (!run) return null
    const slips = wanted ? run.lines.filter((l) => l.employee.code === wanted) : run.lines
    return slips.length ? { run: { code: run.code, month: run.month, status: run.status, paidAt: run.paidAt }, slips } : null
  }
  if (!wanted || !ctx.me || ctx.me.code !== wanted || !ctx.has("payroll")) return null
  const own = await ownPayslip(ctx, runCode, ctx.me.id)
  return own ? { run: own.run, slips: [own.slip] } : null
}
