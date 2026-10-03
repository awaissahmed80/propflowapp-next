"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { bookingEvent } from "@/modules/operations/server/activity"
import { financeAction } from "./context"
import { requestableLines } from "./money-queries"

// Finance › Payment requests: invoices to buyers for installments due (and fees on top), printed
// with the bank details to pay into. They turn Paid on their own once the installments are paid.

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const rs = (v) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(v))}`
const pkDate = (v) => new Date(`${v}T12:00:00+05:00`)
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "finance", action, actorUserId: ctx.user.id, summary })

// A booking's installments still owed, for the New request dialog → { lines } | { error }
export async function loadRequestLines(bookingCode) {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  const lines = await requestableLines(ctx, bookingCode)
  return lines ? { lines } : { error: "That booking is canceled or was removed." }
}

const requestSchema = z.object({
  bookingCode: z.string().trim().min(1, "Pick the booking."),
  installments: z.array(z.coerce.number().int().positive()).max(200).optional().default([]),
  extras: z
    .array(z.object({ label: z.string().trim().min(2, "What's it for?").max(120), amount: z.coerce.number().positive("Enter the amount.").max(1_000_000_000) }))
    .max(10)
    .optional()
    .default([]),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the due date."),
  accountId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(500).optional().default(""),
})

// New payment request → { ok, code } | { error } | { fieldErrors }. Installment amounts are what's
// still owed on each (worked out here, not taken from the form).
export async function createPaymentRequest(input) {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!v.installments.length && !v.extras.length) return { fieldErrors: { lines: "Tick an installment or add a line." } }
  if (v.dueOn < today()) return { fieldErrors: { dueOn: "Pick today or a later date." } }
  const b = await live(ctx.db, "bookings").where({ code: v.bookingCode.toUpperCase() }).first("id", "code", "status", "contactId", "customerName")
  if (!b || ["cancelled", "refunded"].includes(b.status)) return { fieldErrors: { bookingCode: "That booking is canceled or was removed." } }
  const owed = await requestableLines(ctx, b.code)
  const picked = v.installments.map((id) => owed.find((l) => l.id === id))
  if (picked.some((l) => !l)) return { error: "Some of those installments are already paid. Pick them again." }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId, isActive: true }).whereIn("kind", ["cash", "bank"]).first("id"))) return { fieldErrors: { accountId: "Pick the account to pay into." } }
  const lines = [
    ...picked
      .sort((a, c) => new Date(a.dueDate) - new Date(c.dueDate))
      .map((l) => ({ label: l.balance < l.amount ? `${l.label} (balance)` : l.label, amount: l.balance, installmentId: l.id, dueDate: l.dueDate, kind: "installment" })),
    ...v.extras.map((x) => ({ label: x.label, amount: x.amount, kind: "extra" })),
  ]
  const total = Math.round(lines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "payment-request")
    await trx("paymentRequests").insert({
      code,
      bookingId: b.id,
      contactId: b.contactId ?? null,
      status: "issued",
      issuedOn: new Date(),
      dueOn: pkDate(v.dueOn),
      lines: JSON.stringify(lines),
      total,
      accountId: v.accountId ?? null,
      notes: v.notes || null,
      createdBy: ctx.user.id,
    })
    await bookingEvent(trx, ctx, b.id, "payment-request", `Payment request ${code} for ${rs(total)} issued, due ${v.dueOn}`)
  })
  await log(ctx, "request.issued", `issued payment request ${code} for ${rs(total)} on ${b.code}`)
  return { ok: true, code }
}

const openRequest = (ctx, code) =>
  live(ctx.db, "paymentRequests")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "status", "total", "bookingId")

// Cancel an issued request (sent by mistake, or replaced) → { ok } | { error }
export async function cancelPaymentRequest(code) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const q = await openRequest(ctx, code)
  if (!q) return { error: "That payment request was removed." }
  if (q.status !== "issued") return { error: q.status === "paid" ? "It's already paid." : "It's already canceled." }
  const now = new Date()
  await ctx.db("paymentRequests").where({ id: q.id }).update({ status: "cancelled", cancelledAt: now, updatedAt: now, updatedBy: ctx.user.id })
  await log(ctx, "request.cancelled", `canceled payment request ${q.code}`)
  return { ok: true }
}

// Mark a request paid by hand (fees and other lines the ledger can't see) → { ok } | { error }
export async function markPaymentRequestPaid(code) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const q = await openRequest(ctx, code)
  if (!q) return { error: "That payment request was removed." }
  if (q.status !== "issued") return { error: q.status === "paid" ? "It's already paid." : "It's canceled." }
  const now = new Date()
  await ctx.db("paymentRequests").where({ id: q.id }).update({ status: "paid", paidAt: now, updatedAt: now, updatedBy: ctx.user.id })
  await log(ctx, "request.paid", `marked payment request ${q.code} paid`)
  return { ok: true }
}
