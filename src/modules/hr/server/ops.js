import "server-only"
import { notify } from "@/server/notifications"
import { postLoanGiven, postPayroll } from "@/modules/finance/server/posting"
import { afterPaid } from "./payroll"

// HR steps shared by the HR pages and the approvals inbox (a request approved by someone who can).

// A leave request decided: approved or not, and the employee told
export async function settleLeave(trx, ctx, l, decision, note) {
  await trx("leaveRequests")
    .where({ id: l.id })
    .update({ status: decision === "approved" ? "approved" : "rejected", decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: note || null, updatedAt: new Date(), updatedBy: ctx.user.id })
  const emp = await trx("employees").where({ id: l.employeeId }).first("userId")
  if (emp?.userId)
    await notify(trx, [emp.userId], {
      app: "hr",
      kind: `leave.${decision}`,
      title: decision === "approved" ? "Leave approved" : "Leave not approved",
      body: note || l.code,
      href: "/my-leave",
      icon: "calendar-check-line",
      by: ctx.user.id,
    })
}

// An approved payroll run paid: posted to Finance, loans recovered in full closed, next draft started
export async function payApprovedRun(trx, ctx, run, accountId) {
  await postPayroll(trx, ctx, run.id, { accountId })
  await trx("payrollRuns")
    .where({ id: run.id })
    .update({ status: "paid", paidBy: ctx.user.id, paidAt: new Date(), accountId: accountId ?? null, updatedAt: new Date(), updatedBy: ctx.user.id })
  await afterPaid(trx, run, ctx.user.id)
}

// An advance asked for in My Desk approved: paid out from the account and posted to Finance
export async function activateLoan(trx, ctx, loanId, accountId = null) {
  await trx("loans")
    .where({ id: loanId, status: "pending" })
    .update({ status: "active", givenAt: new Date(), approvedBy: ctx.user.id, ...(accountId ? { accountId } : {}), updatedAt: new Date(), updatedBy: ctx.user.id })
  await postLoanGiven(trx, ctx, loanId)
  const l = await trx("loans as l").join("employees as e", "e.id", "l.employeeId").where("l.id", loanId).first("l.code", "l.amount", "e.userId")
  if (l?.userId)
    await notify(trx, [l.userId], {
      app: "hr",
      kind: "advance.approved",
      title: "Advance approved",
      body: `${l.code}: Rs ${new Intl.NumberFormat("en-PK").format(Number(l.amount))}`,
      href: "/my-pay",
      icon: "hand-coin-line",
      by: ctx.user.id,
    })
}
