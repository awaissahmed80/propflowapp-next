import "server-only"
import { can } from "@/modules/users/permissions"
import { closeApproval } from "./requests"
import { activateList, returnToDraft } from "@/modules/portfolio/server/price-list-ops"
import { performTransfer, requestEvent } from "@/modules/estate/server/workflow"
import { getRequest } from "@/modules/estate/server/queries"
import { applyReceiptStatus, confirmPendingReceipt, performCancellation } from "@/modules/operations/server/receipt-ops"
import { executeCommissionPayout, prepareCommissionPayout } from "@/modules/operations/server/commission-ops"
import { salesContext } from "@/modules/operations/server/context"
import { bookingEvent } from "@/modules/operations/server/activity"
import { payRefund, refundedSoFar } from "@/modules/finance/server/refunds"
import { lockDate } from "@/modules/finance/server/posting"
import { activateLoan, payApprovedRun, settleLeave } from "@/modules/hr/server/ops"

// What each approval type does when decided from the inbox. ctx: { db, user, permissions }.
//   canDecide(permissions, grants) who may approve or reject it (never the person who asked)
//   approve(ctx, a) → { message } | { error }
//   reject(ctx, a, note), withdraw(ctx, a)
const priceListRow = (ctx, a) => ctx.db("priceLists").where({ id: a.subjectId }).whereNull("deletedAt").first()

export const HANDLERS = {
  "price-list": {
    canDecide: (permissions) => can(permissions, "portfolio", "approve"),
    async approve(ctx, a) {
      const list = await priceListRow(ctx, a)
      if (!list) return { error: "That price list was deleted." }
      const r = await activateList(ctx.db, ctx.user.id, list, { apply: a.payload?.apply !== false })
      if (r.error) return r
      return { message: `${list.name} is active.${a.payload?.apply !== false ? ` ${r.repriced} unsold ${r.repriced === 1 ? "unit" : "units"} re-priced.` : ""}` }
    },
    async reject(ctx, a, note) {
      const list = await priceListRow(ctx, a)
      if (list?.status === "pending") await returnToDraft(ctx.db, ctx.user.id, list, { status: "rejected", note })
      else await closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      const list = await priceListRow(ctx, a)
      if (list?.status === "pending") await returnToDraft(ctx.db, ctx.user.id, list, { status: "withdrawn" })
      else await closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id })
      return { ok: true }
    },
  },
  // A transfer staff without services.transfer sent up; approving completes it
  "service-transfer": {
    canDecide: (permissions) => can(permissions, "estate", "approve"),
    async approve(ctx, a) {
      // The checklist must still be complete (a step may have been unticked since it was sent)
      const row = await ctx.db("serviceRequests").where({ id: a.subjectId }).whereNull("deletedAt").first("code")
      const req = row && (await getRequest({ ...ctx, scope: "all" }, row.code))
      if (!req) return { error: "That transfer was removed." }
      if (!req.ready)
        return {
          error: `Not ready yet: ${req.steps
            .filter((s) => !s.done)
            .map((s) => s.label.toLowerCase())
            .join(", ")}.`,
        }
      const r = await performTransfer(ctx, a.subjectId)
      if (r.error) return r
      await closeApproval(ctx.db, a.id, { status: "approved", userId: ctx.user.id })
      return { message: `Transfer completed (${r.letterNo}).` }
    },
    async reject(ctx, a, note) {
      await closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note })
      await requestEvent(ctx.db, a.subjectId, "system", `Transfer approval sent back: ${note}`, ctx.user.id)
      return { ok: true }
    },
    async withdraw(ctx, a) {
      await closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id })
      await requestEvent(ctx.db, a.subjectId, "system", "Approval request withdrawn", ctx.user.id)
      return { ok: true }
    },
  },

  // ---------- money: Finance approvers decide (finance.approve) ----------

  // A payment recorded by someone without operations.receipts: approving makes it count and posts it
  receipt: {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      let ok
      await ctx.db.transaction(async (trx) => {
        ok = await confirmPendingReceipt(trx, ctx, a.subjectId)
        if (ok) await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return ok ? { message: "Payment approved and posted." } : { error: "That payment isn't waiting for approval any more." }
    },
    async reject(ctx, a, note) {
      await ctx.db.transaction(async (trx) => {
        const r = await trx("receipts").where({ id: a.subjectId, status: "pending" }).first("id", "bookingId", "code")
        if (r) {
          await trx("receipts").where({ id: r.id }).update({ status: "rejected", statusBy: ctx.user.id, updatedAt: new Date(), updatedBy: ctx.user.id })
          await bookingEvent(trx, ctx, r.bookingId, "approval", `Payment ${r.code} not approved: ${note}`)
        }
        await closeApproval(trx, a.id, { status: "rejected", userId: ctx.user.id, note })
      })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      await ctx.db.transaction(async (trx) => {
        await trx("receipts").where({ id: a.subjectId, status: "pending" }).update({ status: "cancelled", updatedAt: new Date(), updatedBy: ctx.user.id })
        await closeApproval(trx, a.id, { status: "withdrawn", userId: ctx.user.id })
      })
      return { ok: true }
    },
  },

  // Clearing or bouncing a cheque, asked by someone without a cheques grant
  cheque: {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const r = await ctx.db("receipts").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "bookingId", "amount", "status")
      if (!r || r.status !== "clearing") return { error: "That cheque isn't waiting to clear any more." }
      const status = a.payload?.status === "bounced" ? "bounced" : "cleared"
      await ctx.db.transaction(async (trx) => {
        await applyReceiptStatus(trx, ctx, r, status)
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${r.code} marked ${status}.` }
    },
    reject: (ctx, a, note) => closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note }).then(() => ({ ok: true })),
    withdraw: (ctx, a) => closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id }).then(() => ({ ok: true })),
  },

  // Canceling a booking, asked by someone without operations.cancel (Operations or Finance approvers)
  cancellation: {
    canDecide: (permissions) => can(permissions, "operations", "approve") || can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const b = await ctx.db("bookings").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "unitId", "status", "stage")
      if (!b || ["cancelled", "refunded"].includes(b.status)) return { error: "That booking is already canceled or was removed." }
      if (b.stage === "completed") return { error: "Possession is given; it can't be canceled." }
      let refund
      await ctx.db.transaction(async (trx) => {
        refund = await performCancellation(trx, ctx, b, { reason: a.payload?.reason ?? a.reason ?? "Approved cancellation", deductionPct: Number(a.payload?.deductionPct ?? 0) })
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${b.code} canceled. Refund due Rs ${new Intl.NumberFormat("en-PK").format(refund)}.` }
    },
    async reject(ctx, a, note) {
      await closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note })
      await bookingEvent(ctx.db, ctx, a.subjectId, "approval", `Cancellation not approved: ${note}`)
      return { ok: true }
    },
    withdraw: (ctx, a) => closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id }).then(() => ({ ok: true })),
  },

  // Paying commission, asked by someone without operations.pay-commissions. The approver pays it
  // under their own access (they need to see those bookings' commission).
  "commission-payout": {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const sctx = await salesContext()
      const prepared = await prepareCommissionPayout(sctx, a.payload?.input ?? {})
      if (prepared.error) return prepared
      if (prepared.fieldErrors) return { error: Object.values(prepared.fieldErrors)[0] }
      const out = await executeCommissionPayout(sctx, prepared)
      await closeApproval(ctx.db, a.id, { status: "approved", userId: ctx.user.id })
      return { message: `Commission paid (${out.codes.join(", ")}).` }
    },
    reject: (ctx, a, note) => closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note }).then(() => ({ ok: true })),
    withdraw: (ctx, a) => closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id }).then(() => ({ ok: true })),
  },

  // A voucher entered in Finance by someone without finance.approve: approving posts it
  voucher: {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const v = await ctx.db("vouchers").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "status", "voucherDate")
      if (!v || v.status !== "pending") return { error: "That voucher isn't waiting for approval any more." }
      // The books may have been closed since it was entered
      const lock = await lockDate(ctx.db)
      if (lock && new Date(v.voucherDate) <= lock) return { error: `The books are closed up to ${lock.toISOString().slice(0, 10)}. Send it back so it can be re-entered with a later date.` }
      await ctx.db.transaction(async (trx) => {
        await trx("vouchers").where({ id: v.id }).update({ status: "posted", approvedBy: ctx.user.id, approvedAt: new Date(), updatedAt: new Date(), updatedBy: ctx.user.id })
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${v.code} posted.` }
    },
    async reject(ctx, a, note) {
      await ctx.db.transaction(async (trx) => {
        await trx("vouchers").where({ id: a.subjectId, status: "pending" }).update({ status: "rejected", updatedAt: new Date(), updatedBy: ctx.user.id })
        await closeApproval(trx, a.id, { status: "rejected", userId: ctx.user.id, note })
      })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      await ctx.db.transaction(async (trx) => {
        await trx("vouchers").where({ id: a.subjectId, status: "pending" }).update({ status: "rejected", updatedAt: new Date(), updatedBy: ctx.user.id })
        await closeApproval(trx, a.id, { status: "withdrawn", userId: ctx.user.id })
      })
      return { ok: true }
    },
  },

  // A refund to a canceled booking's buyer, asked by someone without finance.refunds
  refund: {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const b = await ctx.db("bookings").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "status", "refundAmount")
      if (!b || b.status !== "cancelled") return { error: "That booking isn't waiting for a refund any more." }
      // Part of it may have been paid directly while this waited; the books may have been closed
      const left = Number(b.refundAmount ?? 0) - (await refundedSoFar(ctx.db, b.id))
      if (Number(a.payload?.amount ?? 0) > left + 0.5) return { error: `Only Rs ${new Intl.NumberFormat("en-PK").format(Math.max(0, Math.round(left)))} is left to refund. Send it back to be re-entered.` }
      const date = a.payload?.date ? new Date(`${String(a.payload.date).slice(0, 10)}T12:00:00+05:00`) : new Date()
      const lock = await lockDate(ctx.db)
      if (lock && date <= lock) return { error: `The books are closed up to ${lock.toISOString().slice(0, 10)}. Send it back so it can be re-entered with a later date.` }
      let out
      await ctx.db.transaction(async (trx) => {
        out = await payRefund(trx, ctx, b, { ...a.payload, date })
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `Refund paid (${out.code}).` }
    },
    reject: (ctx, a, note) => closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note }).then(() => ({ ok: true })),
    withdraw: (ctx, a) => closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id }).then(() => ({ ok: true })),
  },

  // ---------- HR & Payroll ----------

  // Leave asked for in My Desk (or by HR without the grant): decided by hr.approve-leave
  leave: {
    canDecide: (permissions, grants) => Boolean(grants?.["hr.approve-leave"]),
    async approve(ctx, a) {
      const l = await ctx.db("leaveRequests").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "employeeId", "status")
      if (!l || l.status !== "pending") return { error: "That leave request isn't waiting any more." }
      const emp = await ctx.db("employees").where({ id: l.employeeId }).first("userId")
      if (emp?.userId === ctx.user.id) return { error: "Someone else needs to decide your own leave." }
      await ctx.db.transaction(async (trx) => {
        await settleLeave(trx, ctx, l, "approved", null)
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${l.code} approved.` }
    },
    async reject(ctx, a, note) {
      const l = await ctx.db("leaveRequests").where({ id: a.subjectId }).first("id", "code", "employeeId", "status")
      await ctx.db.transaction(async (trx) => {
        if (l?.status === "pending") await settleLeave(trx, ctx, l, "rejected", note)
        await closeApproval(trx, a.id, { status: "rejected", userId: ctx.user.id, note })
      })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      await ctx.db.transaction(async (trx) => {
        await trx("leaveRequests").where({ id: a.subjectId, status: "pending" }).update({ status: "cancelled", updatedAt: new Date() })
        await closeApproval(trx, a.id, { status: "withdrawn", userId: ctx.user.id })
      })
      return { ok: true }
    },
  },

  // A salary advance asked for in My Desk: approving pays it out and posts it (hr.loans)
  advance: {
    canDecide: (permissions, grants) => Boolean(grants?.["hr.loans"]),
    async approve(ctx, a) {
      const l = await ctx.db("loans").where({ id: a.subjectId }).whereNull("deletedAt").first("id", "code", "status")
      if (!l || l.status !== "pending") return { error: "That advance isn't waiting any more." }
      await ctx.db.transaction(async (trx) => {
        await activateLoan(trx, ctx, l.id)
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${l.code} approved and paid out.` }
    },
    async reject(ctx, a, note) {
      await ctx.db.transaction(async (trx) => {
        await trx("loans").where({ id: a.subjectId, status: "pending" }).update({ status: "rejected", updatedAt: new Date() })
        await closeApproval(trx, a.id, { status: "rejected", userId: ctx.user.id, note })
      })
      return { ok: true }
    },
    async withdraw(ctx, a) {
      await ctx.db.transaction(async (trx) => {
        await trx("loans").where({ id: a.subjectId, status: "pending" }).update({ status: "rejected", updatedAt: new Date() })
        await closeApproval(trx, a.id, { status: "withdrawn", userId: ctx.user.id })
      })
      return { ok: true }
    },
  },

  // Paying an approved payroll run, asked by someone who isn't a Finance approver
  "payroll-payment": {
    canDecide: (permissions) => can(permissions, "finance", "approve"),
    async approve(ctx, a) {
      const run = await ctx.db("payrollRuns").where({ id: a.subjectId }).whereNull("deletedAt").first()
      if (!run || run.status !== "approved") return { error: "That payroll run isn't waiting to be paid any more." }
      await ctx.db.transaction(async (trx) => {
        await payApprovedRun(trx, ctx, run, a.payload?.accountId ?? null)
        await closeApproval(trx, a.id, { status: "approved", userId: ctx.user.id })
      })
      return { message: `${run.code} paid and posted to Finance.` }
    },
    reject: (ctx, a, note) => closeApproval(ctx.db, a.id, { status: "rejected", userId: ctx.user.id, note }).then(() => ({ ok: true })),
    withdraw: (ctx, a) => closeApproval(ctx.db, a.id, { status: "withdrawn", userId: ctx.user.id }).then(() => ({ ok: true })),
  },
}
