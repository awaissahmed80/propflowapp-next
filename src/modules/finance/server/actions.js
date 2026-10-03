"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { writeSettings } from "@/modules/portal/server/setup"
import { createApproval, pendingFor } from "@/modules/approvals/server/requests"
import { applyReceiptStatus, createReceipt } from "@/modules/operations/server/receipt-ops"
import { ACCOUNTS, VOUCHER_TYPES, voucherTypeFor } from "../constants"
import { financeAction } from "./context"
import { PostingError, lockDate, moneyAccount, postVoucher, reverseVoucher } from "./posting"
import { payRefund, refundedSoFar } from "./refunds"

// Finance's own money actions. People with finance.approve post directly; anyone else with
// finance.create sends theirs to Approvals, where someone with finance.approve posts it.

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
// "2026-10-03" in Pakistan time → a Date at noon (so it never slips a day)
const pkDate = (v) => new Date(`${v}T12:00:00+05:00`)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date.")
const amount = z.coerce.number().positive("Enter the amount.").max(10_000_000_000)
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "finance", action, actorUserId: ctx.user.id, summary })

async function inOpenPeriod(ctx, date) {
  const lock = await lockDate(ctx.db)
  return !lock || date > lock ? null : `The books are closed up to ${lock.toISOString().slice(0, 10)}. Pick a later date.`
}

// ---------- vouchers ----------

const voucherSchema = z
  .object({
    kind: z.enum(["payment", "receipt", "transfer", "journal"]),
    date: day,
    narration: z.string().trim().min(3, "Say what it's for.").max(500),
    projectId: z.coerce.number().int().positive().optional().nullable(),
    reference: z.string().trim().max(120).optional().default(""),
    chequeNo: z.string().trim().max(40).optional().default(""),
    party: z.string().trim().max(150).optional().default(""),
    // payment / receipt / transfer
    moneyAccountId: z.coerce.number().int().positive().optional().nullable(), // paid from / received into / transfer from
    otherAccountId: z.coerce.number().int().positive().optional().nullable(), // expense or income account / transfer to
    amount: z.coerce.number().min(0).optional().default(0),
    vendorId: z.coerce.number().int().positive().optional().nullable(),
    whtPct: z.coerce.number().min(0).max(50).optional().default(0),
    // journal
    lines: z
      .array(z.object({ accountId: z.coerce.number().int().positive(), debit: z.coerce.number().min(0).default(0), credit: z.coerce.number().min(0).default(0), memo: z.string().trim().max(255).optional().default("") }))
      .optional()
      .default([]),
  })
  .superRefine((v, c) => {
    if (v.kind !== "journal") {
      if (!v.moneyAccountId) c.addIssue({ path: ["moneyAccountId"], code: "custom", message: v.kind === "transfer" ? "Pick where it moves from." : "Pick the cash or bank account." })
      if (!v.otherAccountId)
        c.addIssue({ path: ["otherAccountId"], code: "custom", message: v.kind === "transfer" ? "Pick where it moves to." : v.kind === "payment" ? "Pick what it's for (the account)." : "Pick the income account." })
      if (!(v.amount > 0)) c.addIssue({ path: ["amount"], code: "custom", message: "Enter the amount." })
      if (v.kind === "transfer" && v.moneyAccountId && v.moneyAccountId === v.otherAccountId) c.addIssue({ path: ["otherAccountId"], code: "custom", message: "Pick a different account." })
    } else if (v.lines.filter((l) => l.debit || l.credit).length < 2) c.addIssue({ path: ["lines"], code: "custom", message: "Add at least two lines." })
  })

// A voucher entered by hand → { ok, code, pending? } | { error } | { fieldErrors }
//   payment: Dr the account (expense, advance, payable…) · Cr cash/bank (net) · Cr Income tax withheld
//   receipt: Dr cash/bank · Cr the income (or other) account
//   transfer: Dr the account it moves to · Cr the one it moves from (cash deposit, bank to bank)
//   journal: the lines as entered
export async function createVoucher(input, reason = "") {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  const parsed = voucherSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const date = pkDate(v.date)
  const closed = await inOpenPeriod(ctx, date)
  if (closed) return { fieldErrors: { date: closed } }
  if (date > new Date(Date.now() + 86_400_000)) return { fieldErrors: { date: "That's in the future." } }

  let type = "jv"
  let lines = []
  let party = v.party || null
  if (v.kind === "journal") {
    lines = v.lines.map((l) => ({ account: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo }))
  } else {
    const money = await live(ctx.db, "accounts").where({ id: v.moneyAccountId }).whereIn("kind", ["cash", "bank"]).first("id", "kind", "name")
    if (!money) return { fieldErrors: { moneyAccountId: "Pick a cash or bank account." } }
    const other = await live(ctx.db, "accounts").where({ id: v.otherAccountId, isHeader: false }).first("id", "kind", "type")
    if (!other) return { fieldErrors: { otherAccountId: "Pick an account." } }
    if (v.kind === "payment") {
      const vendor = v.vendorId ? await live(ctx.db, "vendors").where({ id: v.vendorId }).first("id", "name") : null
      if (v.vendorId && !vendor) return { fieldErrors: { vendorId: "That vendor was removed." } }
      party = party ?? vendor?.name ?? null
      const wht = Math.round((v.amount * v.whtPct) / 100)
      type = voucherTypeFor("out", money.kind)
      lines = [
        { account: other.id, debit: v.amount },
        { account: money.id, credit: v.amount - wht },
        { account: ACCOUNTS.wht, credit: wht, memo: wht ? `Income tax withheld ${v.whtPct}%` : null },
      ]
    } else if (v.kind === "receipt") {
      type = voucherTypeFor("in", money.kind)
      lines = [
        { account: money.id, debit: v.amount },
        { account: other.id, credit: v.amount },
      ]
    } else {
      if (!["cash", "bank"].includes(other.kind)) return { fieldErrors: { otherAccountId: "Pick a cash or bank account." } }
      type = other.kind === "bank" || money.kind === "bank" ? "bpv" : "cpv"
      lines = [
        { account: other.id, debit: v.amount },
        { account: money.id, credit: v.amount },
      ]
    }
  }
  if (v.projectId && !(await live(ctx.db, "projects").where({ id: v.projectId }).first("id"))) return { fieldErrors: { projectId: "That project was removed." } }

  const direct = ctx.can("approve")
  let out
  try {
    await ctx.db.transaction(async (trx) => {
      out = await postVoucher(trx, ctx, {
        type,
        date,
        narration: v.narration,
        lines,
        status: direct ? "posted" : "pending",
        source: "manual",
        projectId: v.projectId ?? null,
        vendorId: v.vendorId ?? null,
        party,
        reference: v.reference,
        chequeNo: v.chequeNo,
      })
    })
  } catch (err) {
    if (err instanceof PostingError) return { error: err.message }
    throw err
  }
  if (!direct) {
    const total = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
    await createApproval(ctx.db, {
      type: "voucher",
      app: "finance",
      subjectType: "voucher",
      subjectId: out.id,
      title: `${VOUCHER_TYPES[type].label} ${out.code}: ${rs(total)}`,
      details: v.narration.slice(0, 255),
      amount: total,
      link: `/finance/vouchers?open=${out.code.toLowerCase()}`,
      reason: String(reason ?? "").trim() || null,
      requestedBy: ctx.user.id,
    })
  }
  await log(ctx, direct ? "voucher.posted" : "voucher.requested", `${direct ? "posted" : "sent for approval"} ${out.code}: ${v.narration}`)
  return { ok: true, code: out.code, pending: !direct }
}

// Void a posted voucher: a reversing journal (finance.void). Vouchers the other apps posted are
// changed from there (cancel the booking, bounce the cheque…). → { ok, code } | { error }
export async function voidVoucher(code, reason) {
  const { ctx, error } = await financeAction("edit", "finance.void")
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 3) return { error: "Say why it's voided." }
  const v = await live(ctx.db, "vouchers")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "status", "source", "voucherDate", "reversalOf")
  if (!v) return { error: "That voucher was removed." }
  if (v.status !== "posted") return { error: "Only posted vouchers can be voided." }
  if (v.reversalOf) return { error: "This is a reversal. It can't be voided itself." }
  if (v.source !== "manual") return { error: "This one came from another app. Change it there (cancel the booking, bounce the cheque…)." }
  let out
  try {
    await ctx.db.transaction(async (trx) => {
      out = await reverseVoucher(trx, ctx, v.id, why)
    })
  } catch (err) {
    if (err instanceof PostingError) return { error: err.message }
    throw err
  }
  await log(ctx, "voucher.voided", `voided ${v.code} (${out.code}): ${why}`)
  return { ok: true, code: out.code }
}

// ---------- buyers: payments, cheques, refunds ----------

const bookingFor = (ctx, code) =>
  live(ctx.db, "bookings")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "status", "stage", "netPrice", "agreedPrice", "customerName", "refundAmount")

const paymentSchema = z.object({
  receivedOn: day,
  amount,
  method: z.string().trim().min(1, "How was it paid?"),
  accountId: z.coerce.number().int().positive().optional().nullable(),
  reference: z.string().trim().max(120).optional().default(""),
  chequeNo: z.string().trim().max(30).optional().default(""),
  chequeBank: z.string().trim().max(80).optional().default(""),
  chequeDate: z.string().trim().max(10).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
})

// A buyer's payment taken by Finance (the cashier) → { ok, receipt, pending? } | { error } | { fieldErrors }.
// finance.approve or operations.receipts records it at once; otherwise it waits in Approvals.
export async function receiveBookingPayment(bookingCode, input, reason = "") {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const b = await bookingFor(ctx, bookingCode)
  if (!b) return { fieldErrors: { booking: "Pick the booking." } }
  if (["cancelled", "refunded"].includes(b.status)) return { error: "That booking is canceled." }
  if (!isLookupValue((await getLookups(ctx.db, ["payment-method"]))["payment-method"], v.method)) return { fieldErrors: { method: "How was it paid?" } }
  if (v.method === "cheque" && !v.chequeNo) return { fieldErrors: { chequeNo: "The cheque number." } }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId }).whereIn("kind", ["cash", "bank"]).first("id"))) return { fieldErrors: { accountId: "Pick the account it went into." } }
  const paid = await ctx.db("receipts").where({ bookingId: b.id }).whereIn("status", ["cleared", "clearing", "pending"]).whereNull("deletedAt").sum({ s: "amount" }).first()
  const left = Number(b.netPrice ?? b.agreedPrice) - Number(paid?.s ?? 0)
  if (v.amount > left + 0.5) return { fieldErrors: { amount: `Only ${rs(Math.max(0, left))} is left to pay.` } }
  const receivedAt = pkDate(v.receivedOn)
  if (receivedAt > new Date(Date.now() + 86_400_000)) return { fieldErrors: { receivedOn: "That's in the future." } }
  const closed = await inOpenPeriod(ctx, receivedAt)
  if (closed) return { fieldErrors: { receivedOn: closed } }
  const pending = !(ctx.can("approve") || ctx.grant("operations.receipts"))
  let r
  await ctx.db.transaction(async (trx) => {
    r = await createReceipt(trx, ctx, b, { ...v, receivedAt }, { pending })
  })
  if (pending)
    await createApproval(ctx.db, {
      type: "receipt",
      app: "operations",
      subjectType: "receipt",
      subjectId: r.id,
      title: `Payment ${rs(v.amount)} on ${b.code}`,
      details: `${b.customerName} · ${r.code}`.slice(0, 255),
      amount: v.amount,
      link: `/finance/receipts?open=${r.code.toLowerCase()}`,
      reason: String(reason ?? "").trim() || null,
      requestedBy: ctx.user.id,
    })
  await log(ctx, pending ? "receipt.requested" : "receipt.recorded", `${pending ? "sent for approval" : "received"} ${rs(v.amount)} on ${b.code} (${r.code})`)
  return { ok: true, receipt: r.code, pending }
}

// Clear or bounce a cheque from the cheques register → { ok, pending? } | { error }.
// finance.cheques (or operations.cheques) does it at once; otherwise it waits in Approvals.
export async function setChequeStatus(receiptCode, status, reason = "") {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  if (!["cleared", "bounced"].includes(status)) return { error: "Cleared or bounced?" }
  const code = String(receiptCode ?? "").toUpperCase()
  const r = await ctx
    .db("receipts as r")
    .join("bookings as b", "b.id", "r.bookingId")
    .where("r.code", code)
    .whereNull("r.deletedAt")
    .first("r.id", "r.code", "r.bookingId", "r.amount", "r.status", "b.code as bookingCode", "b.customerName")
  if (!r) return { error: "That receipt was removed." }
  if (r.status !== "clearing") return { error: "It isn't waiting to clear." }
  if (!(ctx.grant("finance.cheques") || ctx.grant("operations.cheques"))) {
    if (await pendingFor(ctx.db, "receipt", r.id)) return { error: "It's already waiting for approval." }
    await createApproval(ctx.db, {
      type: "cheque",
      app: "operations",
      subjectType: "receipt",
      subjectId: r.id,
      title: `Mark ${code} ${status} (${rs(Number(r.amount))})`,
      details: `${r.customerName} · booking ${r.bookingCode}`.slice(0, 255),
      amount: Number(r.amount),
      link: `/finance/cheques`,
      reason: String(reason ?? "").trim() || null,
      payload: { status },
      requestedBy: ctx.user.id,
    })
    return { ok: true, pending: true }
  }
  await ctx.db.transaction((trx) => applyReceiptStatus(trx, ctx, r, status))
  await log(ctx, `receipt.${status}`, `marked ${code} (${rs(Number(r.amount))}) as ${status}`)
  return { ok: true }
}

const refundSchema = z.object({
  date: day,
  amount,
  accountId: z.coerce.number().int().positive().optional().nullable(),
  reference: z.string().trim().max(120).optional().default(""),
  chequeNo: z.string().trim().max(40).optional().default(""),
})

// Pay (part of) a canceled booking's refund → { ok, code?, pending? } | { error } | { fieldErrors }.
// finance.refunds pays at once; otherwise it waits in Approvals.
export async function payBookingRefund(bookingCode, input, reason = "") {
  const { ctx, error } = await financeAction("create")
  if (error) return { error }
  const parsed = refundSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const b = await bookingFor(ctx, bookingCode)
  if (!b || b.status !== "cancelled") return { error: "That booking isn't waiting for a refund." }
  const left = Number(b.refundAmount ?? 0) - (await refundedSoFar(ctx.db, b.id))
  if (v.amount > left + 0.5) return { fieldErrors: { amount: `Only ${rs(Math.max(0, left))} is left to refund.` } }
  const date = pkDate(v.date)
  const closed = await inOpenPeriod(ctx, date)
  if (closed) return { fieldErrors: { date: closed } }
  const account = await moneyAccount(ctx.db, v.accountId ?? null)
  if (v.accountId && account?.id !== v.accountId) return { fieldErrors: { accountId: "Pick the account it's paid from." } }
  if (!ctx.grant("finance.refunds")) {
    if (await pendingFor(ctx.db, "booking", b.id)) return { error: "This booking already has a request waiting for approval." }
    await createApproval(ctx.db, {
      type: "refund",
      app: "finance",
      subjectType: "booking",
      subjectId: b.id,
      title: `Refund ${rs(v.amount)} to ${b.customerName}`,
      details: `Canceled booking ${b.code}`,
      amount: v.amount,
      link: `/finance/refunds`,
      reason: String(reason ?? "").trim() || null,
      payload: { ...v, accountId: account?.id ?? null },
      requestedBy: ctx.user.id,
    })
    return { ok: true, pending: true }
  }
  let out
  await ctx.db.transaction(async (trx) => {
    out = await payRefund(trx, ctx, b, { ...v, accountId: account?.id ?? null, date })
  })
  await log(ctx, "refund.paid", `paid a refund of ${rs(v.amount)} on ${b.code} (${out.code})`)
  return { ok: true, code: out.code }
}

// ---------- settings ----------

const settingsSchema = z.object({
  lockDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  defaultAccountId: z.coerce.number().int().positive().optional().nullable(),
})

// Finance settings: the books closed up to a date, and the default cash/bank account → { ok } | { error }
export async function saveFinanceSettings(input) {
  const { ctx, error } = await financeAction("approve")
  if (error) return { error }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the date." }
  const v = parsed.data
  await writeSettings(ctx.tenant, { finance_lock_date: v.lockDate || null }, ctx.user.id)
  if (v.defaultAccountId) {
    const acc = await live(ctx.db, "accounts").where({ id: v.defaultAccountId }).whereIn("kind", ["cash", "bank"]).first("id")
    if (!acc) return { error: "Pick a cash or bank account." }
    await ctx.db.transaction(async (trx) => {
      await trx("accounts").where({ isDefault: true }).update({ isDefault: false })
      await trx("accounts").where({ id: acc.id }).update({ isDefault: true, updatedAt: new Date(), updatedBy: ctx.user.id })
    })
  }
  await log(ctx, "settings.saved", v.lockDate ? `closed the books up to ${v.lockDate}` : "changed the Finance settings")
  return { ok: true }
}
