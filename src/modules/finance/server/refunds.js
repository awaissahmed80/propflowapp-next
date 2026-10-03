import "server-only"
import { bookingEvent } from "@/modules/operations/server/activity"
import { postRefund } from "./posting"

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`

// What's been refunded on a canceled booking so far (refund vouchers, not voided)
export async function refundedSoFar(db, bookingId) {
  const row = await db("vouchers").where({ sourceType: "booking", sourceId: bookingId, event: "refund", status: "posted" }).whereNull("deletedAt").sum({ s: "amount" }).first()
  return Number(row?.s ?? 0)
}

// Pay (part of) a canceled booking's refund → { code }. The booking turns Refunded once it's all paid.
//   v: { amount, accountId, date, reference, chequeNo }
export async function payRefund(trx, ctx, b, v) {
  const out = await postRefund(trx, ctx, { bookingId: b.id, accountId: v.accountId, amount: v.amount, date: v.date, reference: v.reference, chequeNo: v.chequeNo })
  const total = await refundedSoFar(trx, b.id)
  if (total + 0.5 >= Number(b.refundAmount ?? 0)) await trx("bookings").where({ id: b.id }).update({ status: "refunded", updatedAt: new Date(), updatedBy: ctx.user.id })
  await bookingEvent(trx, ctx, b.id, "approval", `Refund of ${rs(v.amount)} paid (${out.code})${total + 0.5 >= Number(b.refundAmount ?? 0) ? ": fully refunded" : ""}`)
  return out
}
