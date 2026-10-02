"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { deleteFile, saveFile } from "@/server/storage"
import { PROOF_MAX_BYTES, PROOF_TYPES, detectFileType } from "@/server/storage/file-types"
import { logActivity } from "@/server/tenants/activity"
import { logAudit } from "@/modules/console/server/audit"
import { settingsPage } from "../context"
import { invoiceBank, workspaceInvoice } from "./queries"

// Paying PropFlow and changing plan, from Settings › Subscription & Billing. Needs setup rights
// (owner, administrator or a settings permission). PropFlow's billing team confirms transfers
// and changes plans in the console.

async function billingAction() {
  const ctx = await settingsPage("/settings/billing")
  if (!ctx.canEdit) return { error: "Only the owner or an administrator can manage billing." }
  return { ctx }
}

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n)}`

// "I've paid by bank transfer": reference, date and proof (form data) → a payment waiting for
// PropFlow to confirm
export async function sendTransferProof(invoiceCode, formData) {
  const { ctx, error } = await billingAction()
  if (error) return { error }
  if (!(formData instanceof FormData)) return { error: "Send the transfer details with the receipt." }
  const parsed = z
    .object({ reference: z.string().trim().min(3, "Enter the transaction or reference number.").max(120), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date you paid.") })
    .safeParse({ reference: formData.get("reference") ?? "", paidOn: formData.get("paidOn") ?? "" })
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const paidAt = new Date(`${v.paidOn}T12:00:00+05:00`)
  if (paidAt > new Date(Date.now() + 86_400_000)) return { fieldErrors: { paidOn: "The payment date can't be in the future." } }

  const file = formData.get("proof")
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { proof: "Attach the bank receipt or a screenshot of the transfer." } }
  if (file.size > PROOF_MAX_BYTES) return { fieldErrors: { proof: "That file is over 10 MB. Attach a smaller photo or PDF." } }
  const buffer = Buffer.from(await file.arrayBuffer())
  const type = detectFileType(buffer)
  if (!type || !PROOF_TYPES.includes(type.mime)) return { fieldErrors: { proof: "Attach a JPG, PNG, WebP image or a PDF." } }

  const db = platformDb()
  const inv = await live(db, "invoices")
    .where({ code: String(invoiceCode ?? "").toUpperCase(), tenantId: ctx.tenant.id })
    .first("id", "code", "total", "status")
  if (!inv) return { error: "Invoice not found." }
  if (!["issued", "overdue"].includes(inv.status)) return { error: inv.status === "paid" ? "This invoice is already paid." : "This invoice can't take a payment." }
  const pending = await live(db, "invoicePayments").where({ invoiceId: inv.id, status: "pending" }).first("id")
  if (pending) return { error: "We already have a transfer for this invoice and are checking it." }

  const proofKey = await saveFile({ folder: "payment-proofs", buffer, ext: type.ext })
  try {
    await db.transaction(async (trx) => {
      await trx("invoicePayments").insert({
        code: await nextCode(trx, "payment"),
        invoiceId: inv.id,
        method: "bank",
        amount: inv.total,
        reference: v.reference,
        proofKey,
        proofName: String(file.name || `receipt.${type.ext}`).slice(0, 255),
        proofType: type.mime,
        proofSize: buffer.length,
        status: "pending",
        paidAt,
        createdBy: ctx.session.user.id,
      })
      await logAudit(
        {
          actorUserId: ctx.session.user.id,
          action: "invoice.transfer_reported",
          subjectType: "invoice",
          subjectId: inv.id,
          tenantId: ctx.tenant.id,
          details: { summary: `${inv.code} · ${rs(inv.total)} bank transfer reported by the workspace (ref ${v.reference})` },
        },
        trx,
      )
    })
  } catch (err) {
    await deleteFile(proofKey).catch(() => {})
    throw err
  }
  await logActivity(ctx.db, { type: "settings", action: "billing.transfer_reported", actorUserId: ctx.session.user.id, summary: `reported a bank transfer for ${inv.code} (${rs(inv.total)})` })
  return { ok: true }
}

// Ask PropFlow to move the workspace to another plan or billing cycle (a billing support request)
export async function requestPlanChange({ planCode, cycle, note = "" } = {}) {
  const { ctx, error } = await billingAction()
  if (error) return { error }
  const db = platformDb()
  const [plan, tenant] = await Promise.all([
    live(db, "plans")
      .where({ code: String(planCode ?? ""), isPublic: true })
      .first("id", "name"),
    db("tenants").where({ id: ctx.tenant.id }).first("planId", "billingCycle"),
  ])
  if (!plan) return { error: "Pick a plan." }
  if (!["monthly", "yearly"].includes(cycle)) return { error: "Pick monthly or yearly." }
  if (plan.id === tenant.planId && cycle === tenant.billingCycle) return { error: "That's your current plan." }
  const open = await live(db, "supportRequests").where({ tenantId: ctx.tenant.id, category: "billing" }).whereIn("status", ["open", "waiting"]).where("subject", "like", "Change plan to %").first("code")
  if (open) return { error: `You already asked for a plan change (${open.code}). We'll be in touch.` }
  const subject = `Change plan to ${plan.name} (${cycle})`
  let code
  await db.transaction(async (trx) => {
    code = await nextCode(trx, "support_request")
    const [id] = await trx("supportRequests").insert({ code, tenantId: ctx.tenant.id, raisedBy: ctx.session.user.id, subject, category: "billing", priority: "normal", status: "open", createdBy: ctx.session.user.id })
    await trx("supportMessages").insert({
      requestId: id,
      authorId: ctx.session.user.id,
      authorSide: "tenant",
      body: `Please move ${ctx.tenant.name} to the ${plan.name} plan, billed ${cycle}.${String(note).trim() ? `\n\n${String(note).trim().slice(0, 2000)}` : ""}`,
    })
  })
  await logActivity(ctx.db, { type: "settings", action: "billing.plan_change_requested", actorUserId: ctx.session.user.id, summary: `asked to change plan to ${plan.name} (${cycle}), ${code}` })
  return { ok: true, code }
}

// One invoice of this workspace for the preview → { inv, bank } or { error }
export async function loadWorkspaceInvoice(code) {
  const ctx = await settingsPage("/settings/billing")
  const inv = await workspaceInvoice(ctx.tenant.id, code)
  if (!inv) return { error: "Invoice not found." }
  // Only what the document shows: no staff notes, proof files or gateway responses
  const payments = inv.payments.map((p) => ({ id: p.id, code: p.code, status: p.status, method: p.method, reference: p.reference, paidAt: p.paidAt, proofKey: null }))
  return { inv: { ...inv, createdByName: null, payments }, bank: await invoiceBank() }
}
