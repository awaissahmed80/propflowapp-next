"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { paymentSchedule, planSummary } from "@/modules/portfolio/pricing"
import { activeList } from "@/modules/portfolio/server/price-list-queries"
import { ensureContact, linkContact } from "@/modules/contacts/server/links"
import { normalizePkMobile } from "@/lib/phone"
import { removeAsset, storeAsset } from "@/server/assets"
import { ensureBookingFolder, missingFor } from "./documents"
import { salesSettings } from "./settings"
import { AUDIO_TYPES, PROOF_MAX_BYTES, PROOF_TYPES, VOICE_MAX_BYTES, detectFileType } from "@/server/storage/file-types"
import { NOT_HANDLER, handles, salesAction, scoped } from "./context"
import { refreshBooking } from "./ledger"
import { afterStageChange, routeBooking } from "./assignment"
import { bookingEvent } from "./activity"
import { getBooking } from "./queries"
import { commissionPctFor, dealerTerms } from "./commissions"
import { CLEARS_LATER, applyReceiptStatus, createReceipt, performCancellation } from "./receipt-ops"
import { postBookingSale, postReceipt } from "@/modules/finance/server/posting"
import { createApproval, pendingFor } from "@/modules/approvals/server/requests"

// Working a booking in Sales: payment plan, buyer details (KYC), payments and cheques, allotment,
// handover and possession, hold and cancellation. Every change re-applies receipts to the
// schedule and refreshes the booking's status (ledger.js).

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const pkDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d)
// "2026-10-03T14:30" or "2026-10-03" in Pakistan time → a Date
const pkTime = (v) => new Date(`${v.length === 10 ? `${v}T12:00` : v}:00+05:00`)
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`
const CLOSED = ["cancelled", "refunded"]

async function bookingByCode(ctx, code) {
  return scoped(ctx, live(ctx.db, "bookings"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
}
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "operations", action, actorUserId: ctx.user.id, summary })

// The booking again, for the page to show after a change
export async function loadBooking(code) {
  const { ctx, error } = await salesAction("view")
  if (error) return { error }
  const booking = await getBooking(ctx, code)
  return booking ? { booking } : { error: "That booking was removed or isn't yours to see." }
}

// ---------- payment plan ----------

const planSchema = z.object({
  planKey: z.string().min(1, "Pick a payment plan."),
  extraDiscount: z.coerce.number().min(0).default(0),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick when the plan starts."),
})

// Pick (or change) the plan from the project's active price list → { ok } | { error } | { fieldErrors }
// Receipts already in (the token) count towards the new schedule, oldest line first.
export async function setBookingPlan(code, input) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "This booking is canceled." }
  if (b.allotmentNo) return { error: "The allotment letter is issued; the plan can't change now." }
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const list = await activeList(ctx.db, b.projectId)
  const plan = list?.plans.find((p) => p.key === v.planKey)
  if (!plan) return { fieldErrors: { planKey: "That plan isn't on the project's active price list." } }
  const base = Number(b.agreedPrice)
  // Extra discount on top of the plan's, up to the role's limit (sales.discount, % of the price)
  const limit = Number(ctx.grant("operations.discount") ?? 0)
  if (v.extraDiscount > 0 && v.extraDiscount > Math.round((base * limit) / 100))
    return { fieldErrors: { extraDiscount: limit ? `Your limit is ${limit}% (${rs(Math.round((base * limit) / 100))}).` : "Your role can't give extra discount." } }
  if (v.extraDiscount >= base) return { fieldErrors: { extraDiscount: "That's more than the price." } }
  const sched = paymentSchedule(base - v.extraDiscount, plan, new Date(`${v.start}T00:00:00`))
  const now = new Date()
  const listRow = await live(ctx.db, "priceLists").where({ projectId: b.projectId, status: "active" }).first("id")
  await ctx.db.transaction(async (trx) => {
    await trx("bookingInstallments").where({ bookingId: b.id }).whereNull("deletedAt").update({ deletedAt: now, deletedBy: ctx.user.id })
    await trx("bookingInstallments").insert(
      sched.rows.map((r) => ({
        bookingId: b.id,
        number: r.no,
        kind: r.kind === "down" && plan.downPaymentPct >= 100 ? "full" : r.kind,
        label: r.label,
        dueDate: pkDay(r.dueDate),
        amount: r.amount,
        status: "due",
        createdBy: ctx.user.id,
      })),
    )
    await trx("bookings")
      .where({ id: b.id })
      .update({
        plan: JSON.stringify(plan),
        planStart: v.start,
        priceListId: listRow?.id ?? null,
        planDiscount: sched.discount,
        extraDiscount: v.extraDiscount,
        netPrice: sched.net,
        schedule: "plan",
        installments: sched.rows.length,
        firstDueDate: pkDay(sched.rows[0].dueDate),
        // Buyer details already in: the booking is under way
        ...(b.kycAt && b.stage === "booking-kyc" ? { stage: "active" } : {}),
        updatedAt: now,
        updatedBy: ctx.user.id,
      })
    await refreshBooking(trx, b.id)
    await bookingEvent(trx, ctx, b.id, "plan", `Payment plan: ${plan.name} (${planSummary(plan)}), net ${rs(sched.net)}`)
  })
  await afterStageChange(ctx, b.id, b.stage)
  await log(ctx, "booking.plan", `set the payment plan of ${b.code} to ${plan.name} (${planSummary(plan)})`)
  return { ok: true }
}

// Payments (also taken when booking)

// Proof of payment sent with a receipt (form field "proof"): a photo or PDF of the deposit slip,
// cheque or transfer → { file } (or none) | { error }
async function readProof(form) {
  const file = form?.get?.("proof")
  if (!file || typeof file !== "object" || !file.size) return { file: null }
  if (file.size > PROOF_MAX_BYTES) return { error: "The proof is over 10 MB. Use a smaller photo or PDF." }
  const type = detectFileType(Buffer.from(await file.slice(0, 16).arrayBuffer()))
  if (!type || !PROOF_TYPES.includes(type.mime)) return { error: "The proof has to be a photo (JPG, PNG, WebP) or a PDF." }
  return { file }
}
// Into the booking's private folder (documents.js)
const attachProof = async (ctx, booking, receiptId, receiptCode, file) =>
  storeAsset(ctx.db, ctx.tenant, {
    app: "operations",
    ownerType: "receipt",
    ownerId: receiptId,
    folderId: await ensureBookingFolder(ctx.db, booking, ctx.user.id),
    collection: "proof",
    title: `Proof of payment ${receiptCode}`,
    file,
    allowed: PROOF_TYPES,
    isPrivate: true,
    userId: ctx.user.id,
  })
const receiptSchema = z.object({
  amount: z.coerce.number().positive("Enter the amount received."),
  method: z.string().min(1, "How was it paid?"),
  // "2026-10-03T14:30" (Pakistan time), or just the date
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "When was it received?"),
  accountId: z.coerce.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(120).optional().default(""),
  chequeNo: z.string().trim().max(30).optional().default(""),
  chequeBank: z.string().trim().max(80).optional().default(""),
  chequeDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .optional()
    .default(""),
  notes: z.string().trim().max(500).optional().default(""),
  reason: z.string().trim().max(300).optional().default(""), // for the approver, when it goes to Approvals
})

// ---------- new booking (walk-ins, without CRM) ----------

const newSchema = z.object({
  unitCode: z.string().min(1, "Pick the unit."),
  buyer: z.object({
    name: z.string().trim().min(3, "Name as on the CNIC.").max(150),
    phone: z.string().trim().min(10, "Mobile like 0300 1234567."),
    cnic: z
      .string()
      .trim()
      .regex(/^\d{5}-\d{7}-\d$/, "CNIC like 35202-1234567-1."),
    guardianRelation: z.enum(["S/O", "D/O", "W/O"]),
    guardianName: z.string().trim().min(3, "Father's or husband's name.").max(150),
    address: z.string().trim().min(5, "Postal address, for letters.").max(255),
    city: z.string().trim().max(80).optional().default(""),
  }),
  planKey: z.string().min(1, "Pick a payment plan."),
  extraDiscount: z.coerce.number().min(0).default(0),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["token", "booking"]),
  payment: receiptSchema.partial({ method: true, amount: true, receivedOn: true }).optional(),
})

// Book a unit straight from Sales → { ok, code } | { error } | { fieldErrors }
// Token: the unit is held for this buyer with whatever was paid; booking: the down payment is in.
//   form: optional FormData with "proof" for the token or down payment
export async function createSalesBooking(input, form = null) {
  const { ctx, error } = await salesAction("create")
  if (error) return { error }
  const proof = await readProof(form)
  if (proof.error) return { fieldErrors: { proof: proof.error } }
  const parsed = newSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const phone = normalizePkMobile(v.buyer.phone)
  if (!phone) return { fieldErrors: { "buyer.phone": "Mobile like 0300 1234567." } }
  const unit = await live(ctx.db, "units").where({ code: v.unitCode.toUpperCase() }).first("id", "code", "number", "projectId", "price", "status")
  if (!unit || !["available", "on-hold"].includes(unit.status)) return { fieldErrors: { unitCode: "That unit isn't available any more." } }
  const list = await activeList(ctx.db, unit.projectId)
  const plan = list?.plans.find((p) => p.key === v.planKey)
  if (!plan) return { fieldErrors: { planKey: "That plan isn't on the project's active price list." } }
  const price = Number(unit.price)
  const limit = Number(ctx.grant("operations.discount") ?? 0)
  if (v.extraDiscount > Math.round((price * limit) / 100)) return { fieldErrors: { extraDiscount: limit ? `Your limit is ${limit}% (${rs(Math.round((price * limit) / 100))}).` : "Your role can't give extra discount." } }
  const sched = paymentSchedule(price - v.extraDiscount, plan, new Date(`${v.start}T00:00:00`))
  const down = sched.rows[0]
  const pay = v.payment ?? {}
  const amount = Number(pay.amount ?? 0)
  if (v.kind === "booking" && amount < down.amount) return { fieldErrors: { "payment.amount": `A booking needs the ${down.label.toLowerCase()} (${rs(down.amount)}). Book it as a token instead.` } }
  if (v.kind === "token" && amount <= 0) return { fieldErrors: { "payment.amount": "Enter the token received." } }
  if (amount > sched.net) return { fieldErrors: { "payment.amount": "That's more than the price." } }
  // Without operations.receipts the token or down payment waits in Approvals
  const pendingPayment = amount > 0 && !ctx.grant("operations.receipts")
  const methods = (await getLookups(ctx.db, ["payment-method"]))["payment-method"]
  if (amount > 0 && !isLookupValue(methods, pay.method)) return { fieldErrors: { "payment.method": "How was it paid?" } }
  if (pay.method === "cheque" && !pay.chequeNo) return { fieldErrors: { "payment.chequeNo": "The cheque number." } }
  const clash = await live(ctx.db, "contacts").where({ cnic: v.buyer.cnic }).whereNot({ phone }).first("name", "phone")
  if (clash) return { fieldErrors: { "buyer.cnic": `That CNIC is already on ${clash.name} (another mobile).` } }
  const now = new Date()
  let code
  let receiptId
  let receiptCode
  await ctx.db
    .transaction(async (trx) => {
      const fresh = await trx("units").where({ id: unit.id }).forUpdate().first("status")
      if (!["available", "on-hold"].includes(fresh?.status)) throw new Error("UNIT_TAKEN")
      code = await nextCode(trx, "booking")
      const contactId = await ensureContact(trx, { name: v.buyer.name, phone, city: v.buyer.city }, ctx.user.id)
      await trx("contacts")
        .where({ id: contactId })
        .update({ cnic: v.buyer.cnic, guardianRelation: v.buyer.guardianRelation, guardianName: v.buyer.guardianName, address: v.buyer.address, updatedAt: now, updatedBy: ctx.user.id })
      const [id] = await trx("bookings").insert({
        code,
        unitId: unit.id,
        projectId: unit.projectId,
        contactId,
        customerName: v.buyer.name,
        customerPhone: phone,
        kind: v.kind,
        stage: v.kind === "token" ? "booking-kyc" : "active",
        agreedPrice: price,
        listPrice: price,
        tokenAmount: v.kind === "token" ? amount : null,
        plan: JSON.stringify(plan),
        planStart: v.start,
        priceListId: (await trx("priceLists").where({ projectId: unit.projectId, status: "active" }).whereNull("deletedAt").first("id"))?.id ?? null,
        planDiscount: sched.discount,
        extraDiscount: v.extraDiscount,
        netPrice: sched.net,
        schedule: "plan",
        installments: sched.rows.length,
        firstDueDate: pkDay(down.dueDate),
        status: "current",
        agentId: ctx.user.id,
        soldBy: ctx.user.id,
        ...(await dealerTerms(trx, ctx.user.id)),
        kycAt: now,
        bookedAt: now,
        createdBy: ctx.user.id,
      })
      await linkContact(trx, contactId, { type: "booking", id, role: "customer" }, ctx.user.id)
      await trx("bookingInstallments").insert(
        sched.rows.map((r) => ({
          bookingId: id,
          number: r.no,
          kind: r.kind === "down" && plan.downPaymentPct >= 100 ? "full" : r.kind,
          label: r.label,
          dueDate: pkDay(r.dueDate),
          amount: r.amount,
          status: "due",
          createdBy: ctx.user.id,
        })),
      )
      if (amount > 0) {
        receiptCode = await nextCode(trx, "receipt")
        ;[receiptId] = await trx("receipts").insert({
          code: receiptCode,
          bookingId: id,
          receivedOn: pay.receivedOn ? pkTime(pay.receivedOn) : now,
          amount,
          method: pay.method,
          accountId: pay.accountId ?? null,
          reference: pay.reference || null,
          chequeNo: pay.chequeNo || null,
          chequeBank: pay.chequeBank || null,
          chequeDate: pay.chequeDate || null,
          status: pendingPayment ? "pending" : CLEARS_LATER.includes(pay.method) ? "clearing" : "cleared",
          clearedAt: pendingPayment || CLEARS_LATER.includes(pay.method) ? null : now,
          notes: v.kind === "token" ? "Token" : down.label,
          createdBy: ctx.user.id,
        })
      }
      await trx("units").where({ id: unit.id }).update({ status: "booked", holdBy: null, holdReason: null, holdExpiresAt: null, updatedAt: now, updatedBy: ctx.user.id })
      await refreshBooking(trx, id)
      // Into the books: the sale, and the token or down payment
      await postBookingSale(trx, ctx, id)
      if (receiptId && !pendingPayment) await postReceipt(trx, ctx, receiptId)
      await bookingEvent(trx, ctx, id, "created", `Booked ${unit.number} at ${rs(sched.net)} on ${plan.name}${amount ? `; ${v.kind === "token" ? "token" : "down payment"} ${rs(amount)} received` : ""}`)
    })
    .catch((err) => {
      if (err.message === "UNIT_TAKEN") code = null
      else throw err
    })
  if (!code) return { fieldErrors: { unitCode: "That unit was just booked by someone else. Pick another." } }
  if (proof.file && receiptId) await attachProof(ctx, await live(ctx.db, "bookings").where({ code }).first("id", "code", "customerName"), receiptId, receiptCode, proof.file)
  const created = await ctx.db("bookings").where({ code }).first("id", "code", "stage", "customerName")
  if (created && pendingPayment) await askToConfirmReceipt(ctx, created, receiptId, receiptCode, amount)
  if (created) await routeBooking(ctx, created.id, created.stage)
  await log(ctx, "booking.created", `booked ${unit.number} for ${v.buyer.name} (${code})`)
  return { ok: true, code }
}

// ---------- buyer (KYC) ----------

const CNIC = /^\d{5}-\d{7}-\d$/
const buyerSchema = z.object({
  name: z.string().trim().min(3, "Name as on the CNIC.").max(150),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().email("Check the email.").or(z.literal("")).optional().default(""),
  cnic: z.string().trim().regex(CNIC, "CNIC like 35202-1234567-1."),
  guardianRelation: z.enum(["S/O", "D/O", "W/O"]),
  guardianName: z.string().trim().min(3, "Father's or husband's name.").max(150),
  address: z.string().trim().min(5, "Postal address, for letters.").max(255),
  city: z.string().trim().max(80).optional().default(""),
  nominee: z
    .object({
      name: z.string().trim().max(150).optional().default(""),
      relation: z.string().trim().max(30).optional().default(""),
      cnic: z.string().trim().optional().default(""),
    })
    .optional()
    .default({}),
})

// The buyer's details for the allotment letter (and the nominee) → { ok } | { fieldErrors } | { error }
export async function saveBookingBuyer(code, input) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "This booking is canceled." }
  const parsed = buyerSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const n = v.nominee
  if (n.name && (!n.relation || !CNIC.test(n.cnic))) return { fieldErrors: { "nominee.cnic": "With a nominee, add their relation and CNIC." } }
  // The same CNIC on someone else is a different person: stop rather than merge
  const clash = await live(ctx.db, "contacts")
    .where({ cnic: v.cnic })
    .whereNot({ id: b.contactId ?? 0 })
    .first("name")
  if (clash) return { fieldErrors: { cnic: `That CNIC is already on ${clash.name}.` } }
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    await bookingEvent(trx, ctx, b.id, "kyc", b.kycAt ? "Buyer details updated" : "Buyer details added (CNIC, guardian, address)")
    let contactId = b.contactId
    if (!contactId) {
      contactId = await ensureContact(trx, { name: v.name, phone: b.customerPhone }, ctx.user.id)
      await linkContact(trx, contactId, { type: "booking", id: b.id, role: "customer" }, ctx.user.id)
    }
    await trx("contacts")
      .where({ id: contactId })
      .update({
        name: v.name,
        cnic: v.cnic,
        guardianRelation: v.guardianRelation,
        guardianName: v.guardianName,
        address: v.address,
        ...(v.city ? { city: v.city } : {}),
        ...(v.email ? { email: v.email } : {}),
        updatedAt: now,
        updatedBy: ctx.user.id,
      })
    await trx("bookings")
      .where({ id: b.id })
      .update({
        contactId,
        customerName: v.name,
        nominee: n.name ? JSON.stringify({ name: n.name, relation: n.relation, cnic: n.cnic }) : null,
        kycAt: b.kycAt ?? now,
        ...(b.plan && b.stage === "booking-kyc" ? { stage: "active" } : {}),
        updatedAt: now,
        updatedBy: ctx.user.id,
      })
  })
  await afterStageChange(ctx, b.id, b.stage)
  await log(ctx, "booking.kyc", `updated the buyer details on ${b.code}`)
  return { ok: true }
}

// ---------- payments ----------

// Record a payment → { ok, receipt } | { ok, pending, receipt, approval } | { error } | { fieldErrors }.
// Cheques and pay orders wait in clearing; everything else counts at once, against the oldest
// unpaid line first. Without operations.receipts the payment waits in Approvals until someone who
// can record payments approves it.
//   form: optional FormData with "proof" (photo or PDF)
export async function recordReceipt(code, input, form = null) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const proof = await readProof(form)
  if (proof.error) return { fieldErrors: { proof: proof.error } }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "This booking is canceled." }
  const parsed = receiptSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!isLookupValue((await getLookups(ctx.db, ["payment-method"]))["payment-method"], v.method)) return { fieldErrors: { method: "How was it paid?" } }
  if (v.method === "cheque" && !v.chequeNo) return { fieldErrors: { chequeNo: "The cheque number." } }
  const receivedAt = pkTime(v.receivedOn)
  if (receivedAt > new Date(Date.now() + 5 * 60_000)) return { fieldErrors: { receivedOn: "That's in the future." } }
  // Not more than what's still owed (money in clearing or waiting for approval counts as coming)
  const paid = await ctx.db("receipts").where({ bookingId: b.id }).whereIn("status", ["cleared", "clearing", "pending"]).whereNull("deletedAt").sum({ s: "amount" }).first()
  const left = Number(b.netPrice ?? b.agreedPrice) - Number(paid?.s ?? 0)
  if (v.amount > left + 0.5) return { fieldErrors: { amount: `Only ${rs(Math.max(0, Math.round(left)))} is left to pay.` } }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId }).whereIn("kind", ["cash", "bank"]).first("id"))) return { fieldErrors: { accountId: "Pick the account it went into." } }
  const pending = !ctx.grant("operations.receipts")
  let receipt
  let receiptId
  await ctx.db.transaction(async (trx) => {
    ;({ id: receiptId, code: receipt } = await createReceipt(trx, ctx, b, { ...v, receivedAt }, { pending }))
  })
  if (proof.file) await attachProof(ctx, b, receiptId, receipt, proof.file)
  if (pending) {
    const approval = await askToConfirmReceipt(ctx, b, receiptId, receipt, v.amount, v.reason)
    return { ok: true, pending: true, receipt, approval }
  }
  await afterStageChange(ctx, b.id, b.stage)
  await log(ctx, "receipt.recorded", `received ${rs(v.amount)} on ${b.code} (${receipt})`)
  return { ok: true, receipt }
}

// A payment recorded without operations.receipts → Approvals (Finance approvers)
async function askToConfirmReceipt(ctx, b, receiptId, receipt, amount, reason = "") {
  await log(ctx, "receipt.requested", `sent ${rs(amount)} on ${b.code} (${receipt}) for approval`)
  return createApproval(ctx.db, {
    type: "receipt",
    app: "operations",
    subjectType: "receipt",
    subjectId: receiptId,
    title: `Payment ${rs(amount)} on ${b.code}`,
    details: `${b.customerName} · ${receipt}`.slice(0, 255),
    amount,
    link: `/operations/bookings/${b.code.toLowerCase()}`,
    reason: String(reason ?? "").trim() || null,
    requestedBy: ctx.user.id,
  })
}

// A cheque or pay order in clearing: cleared (counts now) or bounced (the line is due again)
// → { ok } | { ok, pending, approval } | { error }. Without a cheques grant (operations.cheques or
// finance.cheques) it goes to Approvals.
export async function setReceiptStatus(receiptCode, status, reason = "") {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  if (!["cleared", "bounced"].includes(status)) return { error: "Cleared or bounced?" }
  const code = String(receiptCode ?? "").toUpperCase()
  const r = await ctx
    .db("receipts as r")
    .join("bookings as b", "b.id", "r.bookingId")
    .where("r.code", code)
    .whereNull("r.deletedAt")
    .first("r.id", "r.bookingId", "r.status", "r.amount", "b.agentId", "b.code as bookingCode", "b.customerName")
  if (!r || !(await scoped(ctx, live(ctx.db, "bookings")).where({ id: r.bookingId }).first("id"))) return { error: "That receipt was removed or isn't yours to see." }
  if (!(await handles(ctx, { agentId: r.agentId }))) return { error: NOT_HANDLER }
  if (r.status !== "clearing") return { error: "It isn't waiting to clear." }
  if (!ctx.grant("operations.cheques") && !ctx.grant("finance.cheques")) {
    if (await pendingFor(ctx.db, "receipt", r.id)) return { error: "It's already waiting for approval." }
    const approval = await createApproval(ctx.db, {
      type: "cheque",
      app: "operations",
      subjectType: "receipt",
      subjectId: r.id,
      title: `Mark ${code} ${status} (${rs(Number(r.amount))})`,
      details: `${r.customerName} · booking ${r.bookingCode}`.slice(0, 255),
      amount: Number(r.amount),
      link: `/operations/bookings/${r.bookingCode.toLowerCase()}`,
      reason: String(reason ?? "").trim() || null,
      payload: { status },
      requestedBy: ctx.user.id,
    })
    return { ok: true, pending: true, approval }
  }
  await ctx.db.transaction((trx) => applyReceiptStatus(trx, ctx, { ...r, code }, status))
  await log(ctx, status === "cleared" ? "receipt.cleared" : "receipt.bounced", `marked ${code} (${rs(Number(r.amount))}) as ${status}`)
  return { ok: true }
}

// ---------- allotment, handover, possession ----------

// Required documents not uploaded yet for a step (when Sales › Settings checks them) → message | null
async function gateCheck(ctx, booking, gate) {
  if (!(await salesSettings(ctx.db)).enforceDocuments) return null
  const missing = await missingFor(ctx.db, booking, gate)
  return missing.length ? `Upload the required documents first: ${missing.join(", ")}.` : null
}

// Issue the allotment letter: buyer details in, plan set, down payment paid → { ok, no } | { error }
export async function issueAllotment(code) {
  const { ctx, error } = await salesAction("edit", "operations.allot")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "This booking is canceled." }
  if (b.allotmentNo) return { error: `Already allotted (${b.allotmentNo}).` }
  if (!b.kycAt) return { error: "Add the buyer's CNIC and details first." }
  if (!b.plan) return { error: "Set up the payment plan first." }
  const down = await live(ctx.db, "bookingInstallments").where({ bookingId: b.id }).whereIn("kind", ["down", "full"]).first("status")
  if (down?.status !== "paid") return { error: "The down payment has to be received (and cleared) first." }
  const docsMissing = await gateCheck(ctx, b, "allotment")
  if (docsMissing) return { error: docsMissing }
  const now = new Date()
  let no
  await ctx.db.transaction(async (trx) => {
    await bookingEvent(trx, ctx, b.id, "allotted", "Allotment letter issued")
    no = await nextCode(trx, "allotment")
    await trx("bookings")
      .where({ id: b.id })
      .update({ allotmentNo: no, allottedAt: now, allottedBy: ctx.user.id, stage: b.stage === "booking-kyc" ? "active" : b.stage, updatedAt: now, updatedBy: ctx.user.id })
    await trx("units").where({ id: b.unitId }).update({ status: "sold", updatedAt: now, updatedBy: ctx.user.id })
  })
  await afterStageChange(ctx, b.id, b.stage)
  await log(ctx, "booking.allotted", `issued allotment ${no} for ${b.code}`)
  return { ok: true, no }
}

// Paid in full: ready for handover; then possession given (completed)
export async function moveBookingStage(code, stage) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "This booking is canceled." }
  const now = new Date()
  if (stage === "handover") {
    if (!b.allotmentNo) return { error: "Issue the allotment letter first." }
    const s = await ctx.db.transaction((trx) => refreshBooking(trx, b.id))
    if (s.balance > 0) return { error: `${rs(Math.round(s.balance))} is still to be paid.` }
    const docsMissing = await gateCheck(ctx, b, "handover")
    if (docsMissing) return { error: docsMissing }
    await ctx.db("bookings").where({ id: b.id }).update({ stage: "handover", handoverAt: now, updatedAt: now, updatedBy: ctx.user.id })
    await bookingEvent(ctx.db, ctx, b.id, "handover", "Paid in full: ready for handover")
    await routeBooking(ctx, b.id, "handover")
    await log(ctx, "booking.handover", `marked ${b.code} ready for handover`)
  } else if (stage === "completed") {
    if (b.stage !== "handover") return { error: "Mark it ready for handover first." }
    const docsMissing = await gateCheck(ctx, b, "possession")
    if (docsMissing) return { error: docsMissing }
    await ctx.db("bookings").where({ id: b.id }).update({ stage: "completed", completedAt: now, updatedAt: now, updatedBy: ctx.user.id })
    await bookingEvent(ctx.db, ctx, b.id, "completed", "Possession given: the booking is complete")
    await routeBooking(ctx, b.id, "completed")
    await log(ctx, "booking.completed", `gave possession on ${b.code}`)
  } else return { error: "Unknown step." }
  return { ok: true }
}

// Put on hold (stops the automatic status) or take off hold
export async function setBookingHold(code, on) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status) || b.status === "transferred") return { error: "This booking can't go on hold." }
  await ctx.db.transaction(async (trx) => {
    await bookingEvent(trx, ctx, b.id, "hold", on ? "Put on hold" : "Taken off hold")
    await trx("bookings")
      .where({ id: b.id })
      .update({ status: on ? "on-hold" : "current", updatedAt: new Date(), updatedBy: ctx.user.id })
    if (!on) await refreshBooking(trx, b.id)
  })
  await log(ctx, on ? "booking.hold" : "booking.unhold", `${on ? "put" : "took"} ${b.code} ${on ? "on" : "off"} hold`)
  return { ok: true }
}

// ---------- cancellation ----------

const cancelSchema = z.object({
  reason: z.string().trim().min(5, "Say why it's canceled.").max(500),
  deductionPct: z.coerce.number().min(0).max(100),
})

// Cancel: the unit goes back on sale, the buyer is refunded what they paid less the deduction
// → { ok, refund } | { ok, pending, approval } | { error }. Without operations.cancel it goes to
// Approvals.
export async function cancelBooking(code, input) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  if (CLOSED.includes(b.status)) return { error: "It's already canceled." }
  if (b.stage === "completed") return { error: "Possession is given; it can't be canceled." }
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!ctx.grant("operations.cancel")) {
    if (await pendingFor(ctx.db, "booking", b.id)) return { error: "This booking already has a request waiting for approval." }
    const paid = await ctx.db("receipts").where({ bookingId: b.id, status: "cleared" }).whereNull("deletedAt").sum({ s: "amount" }).first()
    const refund = Math.round(Number(paid?.s ?? 0) * (1 - v.deductionPct / 100))
    const approval = await createApproval(ctx.db, {
      type: "cancellation",
      app: "operations",
      subjectType: "booking",
      subjectId: b.id,
      title: `Cancel ${b.code} (${b.customerName})`,
      details: `Refund ${rs(refund)} after ${v.deductionPct}% deduction`,
      amount: refund,
      link: `/operations/bookings/${b.code.toLowerCase()}`,
      reason: v.reason,
      payload: v,
      requestedBy: ctx.user.id,
    })
    await bookingEvent(ctx.db, ctx, b.id, "approval", `Cancellation sent for approval: ${v.reason}`)
    return { ok: true, pending: true, approval }
  }
  let refund
  await ctx.db.transaction(async (trx) => {
    refund = await performCancellation(trx, ctx, b, v)
  })
  await log(ctx, "booking.cancelled", `canceled ${b.code}: refund ${rs(refund)} after ${v.deductionPct}% deduction`)
  return { ok: true, refund }
}

// Notes on the booking
export async function saveBookingNotes(code, notes) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  await ctx
    .db("bookings")
    .where({ id: b.id })
    .update({ notes: String(notes ?? "").slice(0, 2000) || null, updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// ---------- the booking's timeline ----------

const activitySchema = z.object({
  type: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(4000).optional().default(""),
  // Files already in the booking's folder, picked in the file manager (asset codes)
  attachments: z.array(z.string().trim().min(1).max(64)).max(10).optional().default([]),
})
const MAX_FILES = 5

// A note or an action (call, WhatsApp, meeting…) on the booking, with up to 5 files
//   form: optional FormData with "files" (photos or PDFs) → { ok } | { error } | { fieldErrors }
export async function addBookingActivity(code, input, form = null) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  const parsed = activitySchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (v.type !== "note" && !isLookupValue((await getLookups(ctx.db, ["activity-type"]))["activity-type"], v.type)) return { fieldErrors: { type: "Pick what you did." } }
  const files = (form?.getAll?.("files") ?? []).filter((f) => f && typeof f === "object" && f.size)
  if (files.length > MAX_FILES) return { fieldErrors: { files: `Up to ${MAX_FILES} files at a time.` } }
  for (const f of files) {
    if (f.size > PROOF_MAX_BYTES) return { fieldErrors: { files: `${f.name} is over 10 MB.` } }
    const type = detectFileType(Buffer.from(await f.slice(0, 16).arrayBuffer()))
    if (!type || !PROOF_TYPES.includes(type.mime)) return { fieldErrors: { files: `${f.name} isn't a photo or PDF.` } }
  }
  // A voice note recorded in the composer (form field "voice")
  let voice = form?.get?.("voice")
  if (!voice || typeof voice !== "object" || !voice.size) voice = null
  if (voice) {
    if (voice.size > VOICE_MAX_BYTES) return { fieldErrors: { voice: "That voice note is too long. Keep it under about 5 minutes." } }
    const type = detectFileType(Buffer.from(await voice.slice(0, 16).arrayBuffer()))
    if (!type || !AUDIO_TYPES.includes(type.mime)) return { fieldErrors: { voice: "That voice note couldn't be read. Record it again." } }
  }
  // Picked files must be in this booking's folder
  let picked = []
  if (v.attachments.length) {
    const folderId = await ensureBookingFolder(ctx.db, b, ctx.user.id)
    picked = await live(ctx.db, "assets").where({ folderId }).whereIn("code", v.attachments).select("id")
    if (picked.length !== new Set(v.attachments).size) return { fieldErrors: { files: "Some of those files were removed. Pick them again." } }
  }
  if (!v.notes && !files.length && !voice && !picked.length) return { fieldErrors: { notes: "Write a note, record a voice note or attach a file." } }
  const now = new Date()
  const [id] = await ctx.db("bookingActivities").insert({
    bookingId: b.id,
    type: v.type,
    notes: v.notes || null,
    attachments: picked.length ? JSON.stringify(picked.map((a) => a.id)) : null,
    by: ctx.user.id,
    at: now,
    createdBy: ctx.user.id,
  })
  const folderId = files.length || voice ? await ensureBookingFolder(ctx.db, b, ctx.user.id) : null
  for (const f of files)
    await storeAsset(ctx.db, ctx.tenant, {
      app: "operations",
      ownerType: "booking-activity",
      ownerId: id,
      folderId,
      collection: "attachments",
      title: f.name,
      file: f,
      allowed: PROOF_TYPES,
      isPrivate: true,
      userId: ctx.user.id,
    })
  if (voice)
    await storeAsset(ctx.db, ctx.tenant, {
      app: "operations",
      ownerType: "booking-activity",
      ownerId: id,
      folderId,
      collection: "voice",
      title: "Voice note",
      file: voice,
      allowed: AUDIO_TYPES,
      isPrivate: true,
      userId: ctx.user.id,
    })
  return { ok: true }
}

// ---------- documents ----------

// Upload documents against a checklist item (Lists & Labels › Booking documents), into the
// booking's private folder → { ok, count } | { error } | { fieldErrors }
export async function uploadBookingDocuments(code, docType, form) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (b.allotmentNo && !(await handles(ctx, b))) return { error: NOT_HANDLER }
  const types = (await getLookups(ctx.db, ["booking-document"]))["booking-document"]
  if (!isLookupValue(types, docType)) return { error: "Pick which document it is." }
  const files = (form?.getAll?.("files") ?? []).filter((f) => f && typeof f === "object" && f.size)
  if (!files.length) return { error: "Choose a file." }
  if (files.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files at a time.` }
  for (const f of files) {
    if (f.size > PROOF_MAX_BYTES) return { error: `${f.name} is over 10 MB.` }
    const type = detectFileType(Buffer.from(await f.slice(0, 16).arrayBuffer()))
    if (!type || !PROOF_TYPES.includes(type.mime)) return { error: `${f.name} isn't a photo or PDF.` }
  }
  const folderId = await ensureBookingFolder(ctx.db, b, ctx.user.id)
  const label = types.find((t) => t.value === docType)?.label ?? docType
  const codes = []
  for (const f of files) {
    const r = await storeAsset(ctx.db, ctx.tenant, {
      app: "operations",
      ownerType: "booking",
      ownerId: b.id,
      folderId,
      collection: "documents",
      category: docType,
      title: label,
      file: f,
      allowed: PROOF_TYPES,
      isPrivate: true,
      userId: ctx.user.id,
    })
    if (r?.error) return { error: r.error }
    codes.push(r.asset.code)
  }
  await bookingEvent(ctx.db, ctx, b.id, "document", `Uploaded ${label}${files.length > 1 ? ` (${files.length} files)` : ""}`)
  return { ok: true, count: files.length, codes }
}

// Upload files into the booking's folder without filing them as a document (the file manager's
// Upload, from the activity composer) → { ok, count, codes } | { error }
export async function uploadBookingFiles(code, form) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (b.allotmentNo && !(await handles(ctx, b))) return { error: NOT_HANDLER }
  const files = (form?.getAll?.("files") ?? []).filter((f) => f && typeof f === "object" && f.size)
  if (!files.length) return { error: "Choose a file." }
  if (files.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files at a time.` }
  const folderId = await ensureBookingFolder(ctx.db, b, ctx.user.id)
  const codes = []
  for (const f of files) {
    const r = await storeAsset(ctx.db, ctx.tenant, {
      app: "operations",
      ownerType: "booking",
      ownerId: b.id,
      folderId,
      collection: "files",
      title: f.name,
      file: f,
      allowed: PROOF_TYPES,
      isPrivate: true,
      userId: ctx.user.id,
    })
    if (r?.error) return { error: r.error }
    codes.push(r.asset.code)
  }
  return { ok: true, count: files.length, codes }
}

// Remove an uploaded document (not payment proofs or activity files) → { ok } | { error }
export async function removeBookingDocument(code, assetCode) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  const a = await live(ctx.db, "assets")
    .where({ code: String(assetCode ?? "").toLowerCase(), ownerType: "booking", ownerId: b.id, collection: "documents" })
    .first()
  if (!a) return { error: "That file was already removed." }
  await removeAsset(ctx.db, a, ctx.user.id)
  await bookingEvent(ctx.db, ctx, b.id, "document", `Removed ${a.title} (${a.fileName})`)
  return { ok: true }
}

// File a checklist item (File manager › Apply): the ticked files in the booking's folder become
// that document; files no longer ticked stop being it → { ok } | { error }
export async function setBookingDocumentFiles(code, docType, assetCodes = []) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (b.allotmentNo && !(await handles(ctx, b))) return { error: NOT_HANDLER }
  const types = (await getLookups(ctx.db, ["booking-document"]))["booking-document"]
  if (!isLookupValue(types, docType)) return { error: "Pick which document it is." }
  const folder = await live(ctx.db, "assetFolders").where({ ownerType: "booking", ownerId: b.id }).first("id")
  if (!folder) return { error: "Nothing has been uploaded to this booking yet." }
  const codes = (Array.isArray(assetCodes) ? assetCodes : []).map((c) => String(c).toLowerCase()).slice(0, 50)
  const now = new Date()
  const label = types.find((t) => t.value === docType)?.label ?? docType
  await ctx.db.transaction(async (trx) => {
    await trx("assets")
      .where({ folderId: folder.id, category: docType })
      .whereNull("deletedAt")
      .whereNotIn("code", codes.length ? codes : ["-"])
      .update({ category: null, updatedAt: now, updatedBy: ctx.user.id })
    if (codes.length) await trx("assets").where({ folderId: folder.id }).whereIn("code", codes).whereNull("deletedAt").update({ category: docType, updatedAt: now, updatedBy: ctx.user.id })
    await bookingEvent(trx, ctx, b.id, "document", codes.length ? `${label}: ${codes.length} ${codes.length === 1 ? "file" : "files"} filed` : `${label}: no files filed`)
  })
  return { ok: true }
}

// Which dealer brought the buyer (none: a direct sale) → { ok } | { error }. Only before its
// commission is paid; the rate follows the dealer's agreed rate (or the default).
export async function setBookingDealer(code, dealerCode) {
  const { ctx, error } = await salesAction("edit")
  if (error) return { error }
  const b = await bookingByCode(ctx, code)
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  if (!(await handles(ctx, b))) return { error: NOT_HANDLER }
  const dealer = dealerCode
    ? await live(ctx.db, "dealers")
        .where({ code: String(dealerCode).toUpperCase(), isActive: true })
        .first("id", "name")
    : null
  if (dealerCode && !dealer) return { error: "That dealer isn't active." }
  if ((dealer?.id ?? null) === (b.dealerId ?? null)) return { ok: true }
  const paid = await ctx.db("commissionPayoutItems").where({ bookingId: b.id }).first("id")
  if (paid) return { error: "Its commission is already paid, so the dealer can't change." }
  await ctx.db.transaction(async (trx) => {
    await trx("bookings")
      .where({ id: b.id })
      .update({ dealerId: dealer?.id ?? null, commissionPct: await commissionPctFor(trx, dealer?.id ?? null), updatedAt: new Date(), updatedBy: ctx.user.id })
    await bookingEvent(trx, ctx, b.id, "commission", dealer ? `Dealer set to ${dealer.name}` : "Marked as a direct sale (no dealer)")
  })
  return { ok: true }
}
