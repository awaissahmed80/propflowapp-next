"use server"

import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { bookingEvent } from "./activity"
import { commissionRows } from "./commissions"
import { salesAction } from "./context"
import { executeCommissionPayout, prepareCommissionPayout } from "./commission-ops"
import { createApproval } from "@/modules/approvals/server/requests"

// Sales › Commissions: pay partners (sales.pay-commissions), mark a clawback recovered, and change
// a booking's rate before it's paid.

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(n))}`

// Pay the selected bookings' commission: one payout per partner → { ok, codes } | { ok, pending, approval } | { error }.
// Without operations.pay-commissions it goes to Approvals for someone who can pay.
export async function payCommissions(input, reason = "") {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const prepared = await prepareCommissionPayout(ctx, input)
  if (prepared.error || prepared.fieldErrors) return prepared
  if (ctx.grant("operations.pay-commissions")) return executeCommissionPayout(ctx, prepared)
  const first = await live(ctx.db, "bookings").where({ code: prepared.v.bookings[0].toUpperCase() }).first("id")
  const approval = await createApproval(ctx.db, {
    type: "commission-payout",
    app: "operations",
    subjectType: "commission-request",
    subjectId: first.id,
    title: `Pay commission on ${prepared.count} ${prepared.count === 1 ? "booking" : "bookings"}`,
    details: [...prepared.groups.values()]
      .map((l) => l[0].partner.name)
      .join(", ")
      .slice(0, 255),
    amount: prepared.gross,
    link: "/operations/commissions",
    reason: String(reason ?? "").trim() || null,
    payload: { input },
    requestedBy: ctx.user.id,
  })
  return { ok: true, pending: true, approval }
}

// A canceled booking's commission was paid; the partner has returned it → { ok } | { error }
export async function markCommissionRecovered(code) {
  const { ctx, error } = await salesAction("view", "operations.pay-commissions")
  if (error) return { error }
  const { rows } = await commissionRows(ctx)
  const r = rows.find((x) => x.code === String(code ?? "").toUpperCase())
  if (!r) return { error: "That booking isn't yours to see." }
  if (r.commission !== "clawback") return { error: "There's nothing to recover on it." }
  await ctx.db.transaction(async (trx) => {
    await trx("commissionPayoutItems").where({ bookingId: r.bookingId }).whereNull("recoveredAt").update({ recoveredAt: new Date(), recoveredBy: ctx.user.id })
    await bookingEvent(trx, ctx, r.bookingId, "commission", `Commission ${rs(r.amount)} recovered from ${r.partner.name}`)
  })
  return { ok: true }
}

// Change a booking's commission rate (before it's paid) → { ok } | { error }
export async function setCommissionPct(code, pct) {
  const { ctx, error } = await salesAction("view", "operations.pay-commissions")
  if (error) return { error }
  const n = Number(pct)
  if (!Number.isFinite(n) || n < 0 || n > 20) return { error: "Between 0% and 20%." }
  const { rows } = await commissionRows(ctx)
  const r = rows.find((x) => x.code === String(code ?? "").toUpperCase())
  if (!r) return { error: "That booking isn't yours to see." }
  if (!["pending", "payable"].includes(r.commission)) return { error: "Its commission is already paid or canceled." }
  await ctx.db.transaction(async (trx) => {
    await trx("bookings").where({ id: r.bookingId }).update({ commissionPct: n, updatedAt: new Date(), updatedBy: ctx.user.id })
    await bookingEvent(trx, ctx, r.bookingId, "commission", `Commission rate changed from ${r.pct}% to ${n}%`)
  })
  return { ok: true }
}
