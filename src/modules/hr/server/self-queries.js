import "server-only"
import { live } from "@/server/db/records"
import { SALARY_PARTS, monthlyGross } from "../constants"
import { leaveBalances } from "./employee-queries"
import { loansLeft } from "./payroll"
import { payslipsFor } from "./payroll-queries"

// My Desk's own HR pages (My leave, My pay): the signed-in person's own employee record only.
// ctx: hrContext() with ctx.me set (pages 404 without it).

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
const json = (v, fallback) => (typeof v === "string" ? JSON.parse(v) : (v ?? fallback))

// Does this person have an employee record here? (launcher buttons; cheap)
export const isEmployee = async (db, userId) => Boolean(await live(db, "employees").where({ userId }).first("id"))

// My leave: this year's balances and my requests, newest first
export async function myLeave(ctx) {
  const emp = await live(ctx.db, "employees").where({ id: ctx.me.id }).first("id", "code", "name")
  const today = pkToday()
  const [balances, leaves] = await Promise.all([
    leaveBalances(ctx, [emp]),
    live(ctx.db, "leaveRequests").where({ employeeId: emp.id }).orderBy("startOn", "desc").limit(60).select("code", "type", "startOn", "endOn", "days", "reason", "status", "decisionNote", "createdAt"),
  ])
  return {
    employee: { code: emp.code, name: emp.name, isMe: true },
    year: today.slice(0, 4),
    balances: balances[emp.code],
    leaves: leaves.map((l) => ({
      code: l.code,
      type: l.type,
      startOn: day(l.startOn),
      endOn: day(l.endOn),
      days: Number(l.days),
      reason: l.reason,
      status: l.status,
      note: l.decisionNote,
      appliedAt: l.createdAt,
      // Waiting ones can be withdrawn; approved ones until they start
      canCancel: l.status === "pending" || (l.status === "approved" && day(l.startOn) > today),
    })),
  }
}

// My pay: salary parts, how it's paid (bank's last 4 only), advances and loans, payslips
export async function myPay(ctx) {
  const e = await live(ctx.db, "employees").where({ id: ctx.me.id }).first("id", "code", "name", "salary", "pf", "payMethod", "bankName", "iban", "status")
  const salary = json(e.salary, {})
  const [loans, left, slips] = await Promise.all([
    live(ctx.db, "loans").where({ employeeId: e.id }).orderBy("id", "desc").select("id", "code", "kind", "amount", "installment", "startMonth", "reason", "status", "givenAt", "createdAt"),
    loansLeft(ctx.db, [e.id]),
    ctx.has("payroll") ? payslipsFor(ctx, e.id) : [],
  ])
  const leftOf = new Map(left.map((l) => [l.id, l]))
  return {
    employee: { code: e.code, name: e.name, active: e.status === "active" },
    salary: Object.fromEntries(SALARY_PARTS.map((p) => [p.key, Number(salary[p.key] ?? 0)])),
    gross: monthlyGross(salary),
    pf: Boolean(e.pf),
    payMethod: e.payMethod,
    bank: e.payMethod === "cash" ? null : { name: e.bankName, last4: e.iban ? String(e.iban).slice(-4) : null },
    loans: loans.map((l) => {
      const amount = Number(l.amount)
      const x = leftOf.get(l.id)
      return {
        code: l.code,
        kind: l.kind,
        amount,
        installment: Number(l.installment),
        startMonth: l.startMonth,
        reason: l.reason,
        status: l.status,
        givenAt: l.givenAt,
        askedAt: l.createdAt,
        recovered: l.status === "active" ? Number(x?.recovered ?? 0) : l.status === "closed" ? amount : 0,
        left: l.status === "active" ? Number(x?.left ?? amount) : l.status === "pending" ? amount : 0,
      }
    }),
    // An advance can be asked for while nothing else is open
    canAsk: e.status === "active" && monthlyGross(salary) > 0 && !loans.some((l) => ["pending", "active"].includes(l.status)),
    payslips: slips,
  }
}
