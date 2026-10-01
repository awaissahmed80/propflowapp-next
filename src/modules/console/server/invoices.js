"use server"

import { after } from "next/server"
import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { requireStaff } from "@/server/auth/dal"
import { sendEmail } from "@/server/mail/send"
import { can, canView } from "@/modules/console/roles"
import { getPaymentSettings } from "./payments"
import { deleteFile, saveFile } from "@/server/storage"
import { renderInvoicePdf } from "@/server/documents/invoice-pdf"
import { PROOF_MAX_BYTES, PROOF_TYPES, detectFileType } from "@/server/storage/file-types"
import { getInvoice, invoiceSuggestion } from "./queries"
import { logAudit } from "./audit"

// Subscription invoices for workspaces. Numbers come from the "invoice" sequence
// (INV-2026-00001, yearly) and are never reused: invoices are voided, not deleted.
// Amounts are always worked out here from the lines, never taken from the browser.

const round2 = (n) => Math.round(n * 100) / 100
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n)}`
// "yyyy-MM-dd" → that day in Pakistan: start (issue) or end (due) of the day
const pkStart = (d) => new Date(`${d}T00:00:00+05:00`)
const pkEnd = (d) => new Date(`${d}T23:59:59+05:00`)
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")

async function requireBilling(path = "/billing") {
  const staff = await requireStaff(path)
  if (!can(staff.role, "billing")) return { error: "Only the owner, an administrator or finance can manage invoices." }
  return { staff }
}

const lineSchema = z.object({
  description: z.string().trim().min(2, "Describe the line.").max(255),
  quantity: z.number().positive("At least 1.").max(10_000),
  unitPrice: z.number().min(0).max(100_000_000),
})
// The editable parts of an invoice; create and update add their own fields, then the date checks
const invoiceFields = z.object({
  issueDate: DATE,
  dueDate: DATE,
  periodStart: DATE.nullable(),
  periodEnd: DATE.nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line.").max(50),
  applyTax: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
})
const withDateChecks = (schema) =>
  schema
    .refine((v) => v.dueDate >= v.issueDate, { path: ["dueDate"], message: "Due on or after the issue date." })
    .refine((v) => !v.periodStart || !v.periodEnd || v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "Ends on or after it starts." })
const invoiceSchema = withDateChecks(invoiceFields.extend({ tenantId: z.number().int().positive("Pick a workspace."), issue: z.boolean() }))
const updateSchema = withDateChecks(invoiceFields.extend({ issue: z.boolean(), sendEmail: z.boolean() }))

// Email an invoice to the workspace, with the invoice attached as a PDF (the same file as Download)
async function emailInvoice(invoiceId) {
  const db = platformDb()
  const row = await db("invoices").where({ id: invoiceId }).first("code")
  const [inv, payments] = await Promise.all([getInvoice(row.code), getPaymentSettings()])
  const to = { email: inv.tenant.email || inv.tenant.owner?.email || null, name: inv.tenant.owner?.name ?? inv.tenant.name }
  if (!to.email) return { ok: false, error: "The workspace has no email to send the invoice to." }
  const bank = payments.methods.find((m) => m.id === "bank")?.enabled ? payments.bank : null

  let pdf
  try {
    pdf = await renderInvoicePdf(inv, bank)
  } catch (err) {
    console.error(`Could not make the PDF for ${inv.code}:`, err)
    return { ok: false, error: "The invoice PDF couldn't be created, so nothing was sent." }
  }
  return sendEmail("invoice", {
    to: to.email,
    attachments: [{ filename: `${inv.code}.pdf`, content: pdf }],
    data: {
      name: to.name,
      company: inv.tenant.name,
      code: inv.code,
      issued_at: inv.issuedAt,
      due_at: inv.dueAt,
      period_start: inv.periodStart,
      period_end: inv.periodEnd,
      lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unitPrice, amount: l.amount })),
      subtotal: inv.subtotal,
      tax_rate: inv.taxRate,
      tax: inv.tax,
      total: inv.total,
      notes: inv.notes,
      bank,
    },
  })
}

// Create an invoice as a draft, or issued (emailed) straight away. Returns { ok, code, emailed } or errors.
export async function createInvoice(input) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  const parsed = invoiceSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors = {}
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message
    return { fieldErrors }
  }
  const v = parsed.data
  const db = platformDb()
  const tenant = await live(db, "tenants").where({ id: v.tenantId }).first("id", "code", "name")
  if (!tenant) return { error: "Workspace not found." }

  const taxRate = v.applyTax ? Number((await db("settings").where({ key: "sales_tax_rate" }).first("value"))?.value ?? 0) : 0
  const lines = v.lines.map((l, i) => ({ ...l, amount: round2(l.quantity * l.unitPrice), sortOrder: (i + 1) * 10 }))
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))
  const tax = round2((subtotal * taxRate) / 100)
  const total = round2(subtotal + tax)
  const subscription = await live(db, "subscriptions").where({ tenantId: tenant.id, status: "active" }).orderBy("id", "desc").first("id")

  const { id, code } = await db.transaction(async (trx) => {
    const code = await nextCode(trx, "invoice")
    const [id] = await trx("invoices").insert({
      code,
      tenantId: tenant.id,
      subscriptionId: subscription?.id ?? null,
      periodStart: v.periodStart,
      periodEnd: v.periodEnd,
      subtotal,
      taxRate,
      tax,
      total,
      currency: "PKR",
      status: v.issue ? "issued" : "draft",
      notes: v.notes || null,
      issuedAt: v.issue ? pkStart(v.issueDate) : null,
      dueAt: pkEnd(v.dueDate),
      createdBy: staff.user.id,
    })
    await trx("invoiceLines").insert(lines.map((l) => ({ invoiceId: id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, sortOrder: l.sortOrder, createdBy: staff.user.id })))
    await logAudit(
      { actorUserId: staff.user.id, action: v.issue ? "invoice.issued" : "invoice.created", subjectType: "invoice", subjectId: id, tenantId: tenant.id, details: { summary: `${code} · ${rs(total)}${v.issue ? "" : " (draft)"}` } },
      trx
    )
    return { id, code }
  })

  if (v.issue) {
    const mail = await emailInvoice(id)
    return { ok: true, code, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
  }
  return { ok: true, code }
}

async function invoiceById(id) {
  return live(platformDb(), "invoices").where({ id: Number(id) }).first()
}

// Draft → issued, and email it
export async function issueInvoice(id) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  const inv = await invoiceById(id)
  if (!inv) return { error: "Invoice not found." }
  if (inv.status !== "draft") return { error: "Only drafts can be issued." }
  const now = new Date()
  await platformDb()("invoices")
    .where({ id: inv.id, status: "draft" })
    .update({ status: "issued", issuedAt: now, dueAt: inv.dueAt && inv.dueAt > now ? inv.dueAt : new Date(now.getTime() + 7 * 86_400_000), updatedAt: now, updatedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: "invoice.issued", subjectType: "invoice", subjectId: inv.id, tenantId: inv.tenantId, details: { summary: `${inv.code} · ${rs(inv.total)}` } })
  const mail = await emailInvoice(inv.id)
  return { ok: true, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

export async function resendInvoice(id) {
  const { error } = await requireBilling()
  if (error) return { error }
  const inv = await invoiceById(id)
  if (!inv || ["draft", "void"].includes(inv.status)) return { error: "Only issued invoices can be sent." }
  const mail = await emailInvoice(inv.id)
  return mail.ok ? { ok: true } : { error: `The email couldn't be sent: ${mail.error}` }
}

const paymentSchema = z.object({
  method: z.enum(["bank", "card", "jazzcash", "easypaisa", "cash", "cheque"], { message: "Pick how it was paid." }),
  reference: z.string().trim().max(120).nullable(),
  paidOn: DATE,
})

// Record the payment for an invoice, with proof (bank receipt, deposit slip, cheque photo…),
// sent as form data: method, reference, paidOn ("yyyy-MM-dd") and proof (file, required).
// Confirms a pending bank transfer if there is one. A paid invoice also brings the workspace up
// to date: past due → active, and the renewal date moves to the end of the invoice's period
// when that's later.
export async function recordPayment(id, formData) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  if (!(formData instanceof FormData)) return { error: "Send the payment details with the proof file." }
  const parsed = paymentSchema.safeParse({
    method: formData.get("method"),
    reference: String(formData.get("reference") ?? "").trim() || null,
    paidOn: formData.get("paidOn"),
  })
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data

  // Proof of payment is required: a PDF or image, checked by its contents
  const file = formData.get("proof")
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { proof: "Attach proof of payment: the bank receipt, deposit slip or a photo of the cheque." } }
  if (file.size > PROOF_MAX_BYTES) return { fieldErrors: { proof: "That file is over 10 MB. Attach a smaller photo or PDF." } }
  const buffer = Buffer.from(await file.arrayBuffer())
  const type = detectFileType(buffer)
  if (!type || !PROOF_TYPES.includes(type.mime)) return { fieldErrors: { proof: "Attach a JPG, PNG, WebP image or a PDF." } }

  const inv = await invoiceById(id)
  if (!inv) return { error: "Invoice not found." }
  if (!["issued", "overdue"].includes(inv.status)) return { error: inv.status === "draft" ? "Issue the invoice first." : "This invoice can't take a payment." }
  const paidAt = pkStart(v.paidOn)
  if (paidAt > new Date()) return { fieldErrors: { paidOn: "The payment date can't be in the future." } }

  const proofKey = await saveFile({ folder: "payment-proofs", buffer, ext: type.ext })
  const proof = { proofKey, proofName: String(file.name || `proof.${type.ext}`).slice(0, 255), proofType: type.mime, proofSize: buffer.length }

  const db = platformDb()
  try {
    await db.transaction(async (trx) => {
      const pending = await live(trx, "invoicePayments").where({ invoiceId: inv.id, status: "pending" }).orderBy("id", "desc").first("id", "code")
      const payment = { method: v.method, amount: inv.total, reference: v.reference || null, ...proof, status: "confirmed", paidAt, verifiedBy: staff.user.id }
      if (pending) await trx("invoicePayments").where({ id: pending.id }).update({ ...payment, ...(pending.code ? {} : { code: await nextCode(trx, "payment") }), updatedAt: new Date(), updatedBy: staff.user.id })
      else await trx("invoicePayments").insert({ ...payment, code: await nextCode(trx, "payment"), invoiceId: inv.id, createdBy: staff.user.id })
      await trx("invoices").where({ id: inv.id }).update({ status: "paid", paidAt, updatedAt: new Date(), updatedBy: staff.user.id })

      const tenant = await trx("tenants").where({ id: inv.tenantId }).first("id", "status", "currentPeriodEndsAt")
      const patch = {}
      if (tenant.status === "past_due") patch.status = "active"
      const periodEnd = inv.periodEnd ? pkEnd(new Date(inv.periodEnd).toISOString().slice(0, 10)) : null
      if (periodEnd && (!tenant.currentPeriodEndsAt || periodEnd > tenant.currentPeriodEndsAt)) patch.currentPeriodEndsAt = periodEnd
      if (Object.keys(patch).length) await trx("tenants").where({ id: tenant.id }).update({ ...patch, updatedAt: new Date(), updatedBy: staff.user.id })

      await logAudit(
        {
          actorUserId: staff.user.id,
          action: "invoice.payment_confirmed",
          subjectType: "invoice",
          subjectId: inv.id,
          tenantId: inv.tenantId,
          details: { summary: `${inv.code} · ${rs(inv.total)} by ${v.method}${v.reference ? ` (${v.reference})` : ""}, proof attached`, proofKey },
        },
        trx
      )
    })
  } catch (err) {
    // Don't keep a proof file for a payment that wasn't saved
    await deleteFile(proofKey).catch(() => {})
    throw err
  }
  return { ok: true }
}

export async function voidInvoice(id, reason) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 3) return { fieldErrors: { reason: "Say why it's being voided." } }
  const inv = await invoiceById(id)
  if (!inv) return { error: "Invoice not found." }
  if (inv.status === "paid") return { error: "Paid invoices can't be voided. Issue a credit instead." }
  if (inv.status === "void") return { ok: true }
  await platformDb()("invoices").where({ id: inv.id }).update({ status: "void", voidedAt: new Date(), voidReason: why.slice(0, 255), updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: "invoice.voided", subjectType: "invoice", subjectId: inv.id, tenantId: inv.tenantId, details: { summary: `${inv.code}: ${why}` } })
  return { ok: true }
}

// The usual lines for a workspace's next invoice (the invoice form's "Fill from subscription")
export async function suggestInvoice(tenantId) {
  const { error } = await requireBilling()
  if (error) return { error }
  const suggestion = await invoiceSuggestion(Number(tenantId))
  return suggestion ?? { error: "Workspace not found." }
}

// One invoice for the preview dialog and the edit form: { inv, bank } or { error }
export async function loadInvoice(code) {
  const staff = await requireStaff("/billing")
  if (!canView(staff.role, "billing")) return { error: "You can't view invoices." }
  const inv = await getInvoice(String(code ?? ""))
  if (!inv) return { error: "Invoice not found." }
  const payments = await getPaymentSettings()
  return { inv, bank: payments.methods.find((m) => m.id === "bank")?.enabled ? payments.bank : null }
}

// Change an invoice that isn't paid or void: dates, period, lines, tax and note. The number stays.
// Drafts can be issued in the same step (issue); issued invoices can be emailed again (sendEmail).
export async function updateInvoice(id, input) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  const inv = await invoiceById(id)
  if (!inv) return { error: "Invoice not found." }
  if (!["draft", "issued", "overdue"].includes(inv.status)) return { error: "Paid and void invoices can't be changed." }
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors = {}
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message
    return { fieldErrors }
  }
  const v = parsed.data
  const db = platformDb()
  // Keep the rate the invoice was made with; use today's platform rate if tax is newly added
  const platformRate = Number((await db("settings").where({ key: "sales_tax_rate" }).first("value"))?.value ?? 0)
  const taxRate = v.applyTax ? (Number(inv.taxRate) > 0 ? Number(inv.taxRate) : platformRate) : 0
  const lines = v.lines.map((l, i) => ({ ...l, amount: round2(l.quantity * l.unitPrice), sortOrder: (i + 1) * 10 }))
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))
  const tax = round2((subtotal * taxRate) / 100)
  const total = round2(subtotal + tax)
  const issuing = inv.status === "draft" && v.issue
  const now = new Date()

  await db.transaction(async (trx) => {
    await trx("invoices")
      .where({ id: inv.id })
      .update({
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        subtotal,
        taxRate,
        tax,
        total,
        notes: v.notes || null,
        dueAt: pkEnd(v.dueDate),
        // Drafts carry their issue date only once issued; issued invoices can have it corrected
        issuedAt: inv.status === "draft" ? (issuing ? pkStart(v.issueDate) : null) : pkStart(v.issueDate),
        ...(issuing ? { status: "issued" } : {}),
        updatedAt: now,
        updatedBy: staff.user.id,
      })
    await trx("invoiceLines").where({ invoiceId: inv.id }).whereNull("deletedAt").update({ deletedAt: now, deletedBy: staff.user.id })
    await trx("invoiceLines").insert(lines.map((l) => ({ invoiceId: inv.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, sortOrder: l.sortOrder, createdBy: staff.user.id })))
    const summary = [inv.code, Number(inv.total) !== total ? `${rs(inv.total)} → ${rs(total)}` : "details changed", issuing ? "issued" : null].filter(Boolean).join(" · ")
    await logAudit({ actorUserId: staff.user.id, action: issuing ? "invoice.issued" : "invoice.updated", subjectType: "invoice", subjectId: inv.id, tenantId: inv.tenantId, details: { summary } }, trx)
  })

  if (issuing || (v.sendEmail && inv.status !== "draft")) {
    const mail = await emailInvoice(inv.id)
    return { ok: true, code: inv.code, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
  }
  return { ok: true, code: inv.code }
}

// Status changes that need no extra details: unpaid ↔ overdue, and paid → unpaid (the recorded
// payment is reversed, kept on file). Paying and voiding have their own actions (details needed).
export async function setInvoiceStatus(id, status) {
  const { staff, error } = await requireBilling()
  if (error) return { error }
  const inv = await invoiceById(id)
  if (!inv) return { error: "Invoice not found." }
  const allowed = { issued: ["overdue", "paid"], overdue: ["issued", "paid"] }
  if (!allowed[status]?.includes(inv.status)) return { error: "That status change isn't possible for this invoice." }

  const db = platformDb()
  await db.transaction(async (trx) => {
    if (inv.status === "paid") {
      await trx("invoicePayments").where({ invoiceId: inv.id, status: "confirmed" }).whereNull("deletedAt").update({ status: "reversed", updatedAt: new Date(), updatedBy: staff.user.id })
    }
    await trx("invoices")
      .where({ id: inv.id })
      .update({ status, ...(inv.status === "paid" ? { paidAt: null } : {}), updatedAt: new Date(), updatedBy: staff.user.id })
    const label = { issued: "unpaid", overdue: "overdue" }[status]
    await logAudit(
      {
        actorUserId: staff.user.id,
        action: "invoice.status_changed",
        subjectType: "invoice",
        subjectId: inv.id,
        tenantId: inv.tenantId,
        details: { summary: `${inv.code}: ${inv.status === "issued" ? "unpaid" : inv.status} → ${label}${inv.status === "paid" ? " (payment reversed)" : ""}` },
      },
      trx
    )
  })
  return { ok: true }
}
