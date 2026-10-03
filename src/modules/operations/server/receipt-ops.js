import "server-only"
import { refreshBooking } from "./ledger"
import { bookingEvent } from "./activity"
import { nextCode } from "@/server/db/numbering"
import { postCancellation, postReceipt, postReceiptStatus } from "@/modules/finance/server/posting"

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`

// Payments, cheques and cancellations, shared by Operations, Finance and Approvals (a request
// approved by someone who can). Each change refreshes the booking and posts to Finance.

// A cheque or pay order in clearing cleared (counts now, into its bank) or bounced (the line is due
// again), from a booking in Operations or the cheques register in Finance. Posts the voucher too.
//   r: { id, code, bookingId, amount }
export async function applyReceiptStatus(trx, ctx, r, status) {
  const now = new Date()
  await trx("receipts")
    .where({ id: r.id })
    .update({ status, ...(status === "cleared" ? { clearedAt: now } : { bouncedAt: now }), statusBy: ctx.user.id, updatedAt: now, updatedBy: ctx.user.id })
  await refreshBooking(trx, r.bookingId)
  await postReceiptStatus(trx, ctx, r.id, status)
  await bookingEvent(trx, ctx, r.bookingId, status, status === "cleared" ? `${r.code} cleared: ${rs(Number(r.amount))} counts now` : `${r.code} bounced: ${rs(Number(r.amount))} is due again`)
}

export const CLEARS_LATER = ["cheque", "pay-order"]

// Save a payment on a booking, from Operations or Finance → { id, code }. pending: waiting in
// Approvals (doesn't count, isn't posted, until someone approves it).
//   v: { receivedAt (Date), amount, method, accountId, reference, chequeNo, chequeBank, chequeDate, notes }
export async function createReceipt(trx, ctx, booking, v, { pending = false } = {}) {
  const code = await nextCode(trx, "receipt")
  const later = CLEARS_LATER.includes(v.method)
  const [id] = await trx("receipts").insert({
    code,
    bookingId: booking.id,
    receivedOn: v.receivedAt,
    amount: v.amount,
    method: v.method,
    accountId: v.accountId ?? null,
    reference: v.reference || null,
    chequeNo: v.chequeNo || null,
    chequeBank: v.chequeBank || null,
    chequeDate: v.chequeDate || null,
    status: pending ? "pending" : later ? "clearing" : "cleared",
    clearedAt: pending || later ? null : new Date(),
    notes: v.notes || null,
    createdBy: ctx.user.id,
  })
  if (pending) {
    // "approval", not "receipt": nobody is told it was received until it's approved
    await bookingEvent(trx, ctx, booking.id, "approval", `Payment of ${rs(v.amount)} (${code}) sent for approval`)
    return { id, code }
  }
  await refreshBooking(trx, booking.id)
  await postReceipt(trx, ctx, id)
  await bookingEvent(trx, ctx, booking.id, "receipt", `Received ${rs(v.amount)} (${code})${later ? ", in clearing" : ""}${v.notes ? ` for ${v.notes}` : ""}`)
  return { id, code }
}

// A payment waiting for approval was approved: it counts (or waits to clear) and is posted
export async function confirmPendingReceipt(trx, ctx, receiptId) {
  const r = await trx("receipts").where({ id: receiptId }).first("id", "code", "bookingId", "amount", "method", "status")
  if (!r || r.status !== "pending") return false
  const later = CLEARS_LATER.includes(r.method)
  await trx("receipts")
    .where({ id: r.id })
    .update({ status: later ? "clearing" : "cleared", clearedAt: later ? null : new Date(), statusBy: ctx.user.id, updatedAt: new Date(), updatedBy: ctx.user.id })
  await refreshBooking(trx, r.bookingId)
  await postReceipt(trx, ctx, r.id)
  await bookingEvent(trx, ctx, r.bookingId, "receipt", `Payment ${r.code} approved: ${rs(Number(r.amount))}${later ? ", in clearing" : " counts now"}`)
  return true
}

// Cancel a booking: the unit goes back on sale, the buyer is owed what they paid less the
// deduction, cheques in clearing are dropped; posted to Finance → refund
//   v: { reason, deductionPct }
export async function performCancellation(trx, ctx, b, v) {
  const paid = await trx("receipts").where({ bookingId: b.id, status: "cleared" }).whereNull("deletedAt").sum({ s: "amount" }).first()
  const refund = Math.round(Number(paid?.s ?? 0) * (1 - v.deductionPct / 100))
  const now = new Date()
  await trx("bookings")
    .where({ id: b.id })
    .update({ status: "cancelled", cancelledAt: now, cancelledBy: ctx.user.id, cancelReason: v.reason, deductionPct: v.deductionPct, refundAmount: refund, updatedAt: now, updatedBy: ctx.user.id })
  await trx("receipts").where({ bookingId: b.id }).whereIn("status", ["clearing", "pending"]).update({ status: "cancelled", statusBy: ctx.user.id, updatedAt: now })
  await trx("units").where({ id: b.unitId }).whereIn("status", ["booked", "sold"]).update({ status: "available", updatedAt: now, updatedBy: ctx.user.id })
  await refreshBooking(trx, b.id)
  await postCancellation(trx, ctx, b.id)
  await bookingEvent(trx, ctx, b.id, "cancelled", `Canceled: ${v.reason}\nRefund due ${rs(refund)} after ${v.deductionPct}% deduction`)
  return refund
}
