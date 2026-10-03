"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { notify } from "@/server/notifications"
import { normalizePhone } from "@/lib/phone"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { writeSettings } from "@/modules/portal/server/setup"
import { bookingEvent } from "@/modules/operations/server/activity"
import { createApproval, pendingFor } from "@/modules/approvals/server/requests"
import { CHECKLISTS, NDC_PURPOSES, OPEN_STATUSES, TYPES, UPDATE_FIELDS, dueFrom, feeFor } from "../constants"
import { scoped, servicesAction } from "./context"
import { SETTINGS_KEY, getRequest, servicesSettings, validNdc } from "./queries"
import { closeTransferApproval, performTransfer, requestEvent } from "./workflow"
import { moneyAccount, postServiceFee } from "@/modules/finance/server/posting"

// Estate Management: log a request, work its checklist, record or waive its fee, assign it, and
// finish it the way its type finishes (issue the NDC, complete the transfer, hand over
// possession, or resolve). Every change lands on the request's timeline.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const link = (code) => `/estate-management/requests/${code.toLowerCase()}`
const byCode = (ctx, code) =>
  scoped(ctx, live(ctx.db, "serviceRequests"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
const NOT_FOUND = { error: "That request was removed or isn't yours to see." }
const closedNow = (r) => ["completed", "rejected"].includes(r.status)

// ---------- new request ----------

const createSchema = z
  .object({
    type: z.enum(TYPES),
    booking: z.string().trim().max(30).optional().nullable(),
    subject: z.string().trim().min(3, "Give the request a short title.").max(200),
    details: z.string().trim().max(4000).optional().default(""),
    channel: z.string().trim().max(20).optional().nullable(),
    priority: z.enum(["urgent", "high", "normal", "low"]).optional().default("normal"),
    category: z.string().trim().max(40).optional().nullable(),
    ndcPurpose: z
      .enum(NDC_PURPOSES.map((p) => p.value))
      .optional()
      .nullable(),
    documentKind: z.string().trim().max(40).optional().nullable(),
    updateField: z
      .enum(UPDATE_FIELDS.map((f) => f.value))
      .optional()
      .nullable(),
    purchaser: z
      .object({
        name: z.string().trim().max(120).optional().default(""),
        cnic: z.string().trim().max(20).optional().default(""),
        phone: z.string().trim().max(30).optional().default(""),
        relation: z.string().trim().max(10).optional().default("S/O"),
        guardian: z.string().trim().max(120).optional().default(""),
        address: z.string().trim().max(300).optional().default(""),
      })
      .optional()
      .nullable(),
    assignTo: z.coerce.number().int().positive().optional().nullable(),
  })
  .superRefine((v, c) => {
    if (v.type !== "complaint" && !v.booking) c.addIssue({ path: ["booking"], code: "custom", message: "Pick the file." })
    if (v.type === "transfer") {
      if (!v.purchaser?.name || v.purchaser.name.length < 3) c.addIssue({ path: ["purchaser", "name"], code: "custom", message: "Enter the purchaser's name." })
      if (!normalizePhone(v.purchaser?.phone)) c.addIssue({ path: ["purchaser", "phone"], code: "custom", message: "Enter a mobile like 0300 1234567." })
      if (v.purchaser?.cnic && !/^\d{5}-?\d{7}-?\d$/.test(v.purchaser.cnic)) c.addIssue({ path: ["purchaser", "cnic"], code: "custom", message: "Use the format 35202-1234567-1." })
    }
    if (v.type === "ndc" && !v.ndcPurpose) c.addIssue({ path: ["ndcPurpose"], code: "custom", message: "Pick what the NDC is for." })
    if (v.type === "document" && !v.documentKind) c.addIssue({ path: ["documentKind"], code: "custom", message: "Pick the document." })
    if (v.type === "record-update" && !v.updateField) c.addIssue({ path: ["updateField"], code: "custom", message: "Pick what changes." })
    if (v.type === "complaint" && !v.category) c.addIssue({ path: ["category"], code: "custom", message: "Pick the category." })
  })

// → { ok, code } | { error } | { fieldErrors }
export async function createRequest(input) {
  const { ctx, error } = await servicesAction("create")
  if (error) return { error }
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const lists = await getLookups(ctx.db, ["complaint-category", "service-document", "service-channel"])
  if (v.category && !isLookupValue(lists["complaint-category"], v.category)) return { fieldErrors: { category: "Pick the category." } }
  if (v.documentKind && !isLookupValue(lists["service-document"], v.documentKind)) return { fieldErrors: { documentKind: "Pick the document." } }
  if (v.channel && !isLookupValue(lists["service-channel"], v.channel)) return { fieldErrors: { channel: "Pick how it came in." } }

  const booking = v.booking
    ? await live(ctx.db, "bookings as b")
        .where("b.code", v.booking.toUpperCase())
        .whereNotIn("b.status", ["cancelled", "refunded"])
        .join("units as u", "u.id", "b.unitId")
        .first("b.id", "b.code", "b.contactId", "b.unitId", "u.type", "u.sizeValue", "u.sizeUnit")
    : null
  if (v.booking && !booking) return { fieldErrors: { booking: "That file was removed or canceled." } }
  // One open request per file and type (complaints can pile up)
  if (booking && v.type !== "complaint") {
    const open = await live(ctx.db, "serviceRequests").where({ bookingId: booking.id, type: v.type }).whereIn("status", OPEN_STATUSES).first("code")
    if (open) return { error: `This file already has an open ${v.type === "ndc" ? "NDC" : v.type.replace("-", " ")} request (${open.code}).` }
  }
  // Giving it to someone else needs services.assign; otherwise it's yours
  const assignedTo = v.assignTo && v.assignTo !== ctx.user.id ? (ctx.grant("estate.assign") ? v.assignTo : null) : ctx.user.id
  if (v.assignTo && v.assignTo !== ctx.user.id && !ctx.grant("estate.assign")) return { fieldErrors: { assignTo: "Your role can't give requests to other people." } }

  const settings = await servicesSettings(ctx.db)
  const amount = feeFor(settings, v.type, { unit: booking ? { type: booking.type, sizeValue: booking.sizeValue, sizeUnit: booking.sizeUnit } : null, documentKind: v.documentKind })
  const data =
    v.type === "transfer"
      ? { to: { ...v.purchaser, phone: normalizePhone(v.purchaser.phone) } }
      : v.type === "ndc"
        ? { purpose: v.ndcPurpose }
        : v.type === "document"
          ? { kind: v.documentKind }
          : v.type === "record-update"
            ? { field: v.updateField }
            : v.type === "complaint"
              ? { category: v.category }
              : {}
  const now = new Date()
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "service-request")
    const [id] = await trx("serviceRequests").insert({
      code,
      type: v.type,
      status: "new",
      priority: v.type === "complaint" ? v.priority : "normal",
      channel: v.channel || null,
      bookingId: booking?.id ?? null,
      unitId: booking?.unitId ?? null,
      contactId: booking?.contactId ?? null,
      subject: v.subject,
      details: v.details || null,
      assignedTo,
      steps: JSON.stringify([]),
      fee: amount ? JSON.stringify({ amount }) : null,
      data: JSON.stringify(data),
      dueAt: dueFrom(settings, v.type, v.priority, now),
      createdBy: ctx.user.id,
    })
    await requestEvent(trx, id, "system", `Logged${v.channel ? ` (${lists["service-channel"].find((c) => c.value === v.channel)?.label ?? v.channel})` : ""}`, ctx.user.id)
    if (v.details) await requestEvent(trx, id, "customer", v.details, ctx.user.id)
  })
  if (assignedTo && assignedTo !== ctx.user.id)
    await notify(ctx.db, [assignedTo], { app: "estate", kind: "request.assigned", title: `New request for you · ${code}`, body: v.subject, href: link(code), icon: "home-gear-line", by: ctx.user.id })
  await logActivity(ctx.db, { type: "estate", action: "request.created", actorUserId: ctx.user.id, summary: `logged ${code}: ${v.subject}` })
  return { ok: true, code }
}

// ---------- working a request ----------

// Tick or untick a manual checklist step → { ok } | { error }
export async function setStep(code, key, done) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  if (closedNow(r)) return { error: "This request is closed. Reopen it first." }
  const step = (CHECKLISTS[r.type] ?? []).find((s) => s.key === key)
  if (!step || step.auto) return { error: "That step updates by itself." }
  const steps = new Set(json(r.steps, []))
  if (done) steps.add(key)
  else steps.delete(key)
  const data = json(r.data, {})
  // Steps that record when they happened
  if (key === "biometric") data.biometricAt = done ? new Date() : null
  if (key === "demarcation") data.demarcatedAt = done ? new Date() : null
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ steps: JSON.stringify([...steps]), data: JSON.stringify(data), ...(r.status === "new" && done ? { status: "in-progress" } : {}), updatedAt: new Date(), updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `${done ? "Done" : "Not done"}: ${step.label}`, ctx.user.id)
  })
  return { ok: true }
}

// Mark in progress / waiting on the customer / reopen → { ok } | { error }
export async function setRequestStatus(code, status) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  if (!["in-progress", "awaiting-customer"].includes(status)) return { error: "Finish a request with its own button." }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  if (r.status === status) return { ok: true }
  const reopen = closedNow(r)
  // A finished transfer, NDC or possession can't be undone by reopening it (finishing again would repeat it)
  if (reopen && r.status === "completed" && ["transfer", "ndc", "possession"].includes(r.type)) return { error: "This one is done and its paper is issued. Log a new request instead." }
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ status, ...(reopen ? { closedAt: null, resolution: null } : {}), updatedAt: new Date(), updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", reopen ? "Reopened" : status === "awaiting-customer" ? "Waiting on the customer" : "In progress", ctx.user.id)
  })
  return { ok: true }
}

// Resolve (complaints, documents, record updates) or reject (any type) with a note → { ok } | { error }
export async function closeRequest(code, outcome, note) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const text = String(note ?? "").trim()
  if (text.length < 3) return { fieldErrors: { note: outcome === "rejected" ? "Say why it's rejected." : "Say what was done." } }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  if (closedNow(r)) return { error: "This request is already closed." }
  if (outcome === "completed") {
    if (!["complaint", "document", "record-update"].includes(r.type)) return { error: "Finish this request with its own button." }
    const req = await getRequest(ctx, r.code)
    if (!req.ready)
      return {
        error: `Finish the checklist first: ${req.steps
          .filter((s) => !s.done)
          .map((s) => s.label.toLowerCase())
          .join(", ")}.`,
      }
  } else if (outcome !== "rejected") return { error: "Unknown outcome." }
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ status: outcome, resolution: text.slice(0, 4000), closedAt: now, updatedAt: now, updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `${outcome === "rejected" ? "Rejected" : "Resolved"}: ${text}`, ctx.user.id)
  })
  if (r.type === "transfer") await closeTransferApproval(ctx.db, r.id, ctx.user.id)
  return { ok: true }
}

// A note or what the customer said → { ok } | { error }
export async function addRequestNote(code, { kind = "note", text } = {}) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const t = String(text ?? "").trim()
  if (!t) return { fieldErrors: { text: "Write the note." } }
  if (!["note", "customer"].includes(kind)) return { error: "Unknown note." }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  await requestEvent(ctx.db, r.id, kind, t, ctx.user.id)
  return { ok: true }
}

// Give it to someone (services.assign) → { ok } | { error }
export async function assignRequest(code, userId) {
  const { ctx, error } = await servicesAction("edit", "estate.assign")
  if (error) return { error }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  const id = userId ? Number(userId) : null
  if (id === r.assignedTo) return { ok: true }
  const people = id ? await ctx.db("members").where({ userId: id }).whereNull("deletedAt").first("userId") : true
  if (!people) return { error: "They can't take requests." }
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests").where({ id: r.id }).update({ assignedTo: id, updatedAt: new Date(), updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", id ? "Assigned" : "Unassigned", ctx.user.id)
  })
  if (id && id !== ctx.user.id) await notify(ctx.db, [id], { app: "estate", kind: "request.assigned", title: `Request for you · ${r.code}`, body: r.subject, href: link(r.code), icon: "home-gear-line", by: ctx.user.id })
  return { ok: true }
}

// A complaint's priority (its due time follows) → { ok } | { error }
export async function setPriority(code, priority) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  if (!["urgent", "high", "normal", "low"].includes(priority)) return { error: "Pick a priority." }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  if (r.type !== "complaint") return { error: "Only complaints have a priority." }
  const settings = await servicesSettings(ctx.db)
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ priority, dueAt: dueFrom(settings, "complaint", priority, r.createdAt), updatedAt: new Date(), updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `Priority: ${priority}`, ctx.user.id)
  })
  return { ok: true }
}

const feeSchema = z.object({
  method: z.string().trim().min(1, "Pick how it was paid."),
  ref: z.string().trim().max(120).optional().default(""),
  accountId: z.coerce.number().int().positive().optional().nullable(), // cash or bank it went into; empty: the default
})

// The fee was paid → { ok } | { error } | { fieldErrors }
export async function recordFee(code, input) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const parsed = feeSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (!isLookupValue((await getLookups(ctx.db, ["payment-method"]))["payment-method"], v.method)) return { fieldErrors: { method: "Pick how it was paid." } }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  const fee = json(r.fee, null)
  if (!fee?.amount) return { error: "This request has no fee." }
  if (fee.paidAt || fee.waived) return { error: "The fee is already settled." }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId, isActive: true }).whereIn("kind", ["cash", "bank"]).first("id"))) return { fieldErrors: { accountId: "Pick the account it went into." } }
  const rs = `Rs ${new Intl.NumberFormat("en-PK").format(fee.amount)}`
  await ctx.db.transaction(async (trx) => {
    const account = await moneyAccount(trx, v.accountId ?? null)
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({
        fee: JSON.stringify({ ...fee, paidAt: new Date(), method: v.method, ref: v.ref || null, accountId: account?.id ?? null, by: ctx.user.id }),
        ...(r.status === "new" ? { status: "in-progress" } : {}),
        updatedAt: new Date(),
        updatedBy: ctx.user.id,
      })
    await requestEvent(trx, r.id, "system", `Fee received: ${rs}${v.ref ? ` (${v.ref})` : ""}`, ctx.user.id)
    await postServiceFee(trx, ctx, r.id)
  })
  await logActivity(ctx.db, { type: "estate", action: "fee.received", actorUserId: ctx.user.id, summary: `received ${rs} for ${r.code}` })
  return { ok: true }
}

// Waive the fee (services.waive) → { ok } | { error }
export async function waiveFee(code, reason) {
  const { ctx, error } = await servicesAction("edit", "estate.waive")
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 3) return { fieldErrors: { reason: "Say why it's waived." } }
  const r = await byCode(ctx, code)
  if (!r) return NOT_FOUND
  const fee = json(r.fee, null)
  if (!fee?.amount) return { error: "This request has no fee." }
  if (fee.paidAt || fee.waived) return { error: "The fee is already settled." }
  await ctx.db.transaction(async (trx) => {
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ fee: JSON.stringify({ ...fee, waived: true, reason: why.slice(0, 300), paidAt: null, by: ctx.user.id, waivedAt: new Date() }), updatedAt: new Date(), updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `Fee waived: ${why}`, ctx.user.id)
  })
  return { ok: true }
}

// ---------- finishing by type ----------

const readyOrError = (req) =>
  req.ready
    ? null
    : {
        error: `Not ready yet: ${req.steps
          .filter((s) => !s.done)
          .map((s) => s.label.toLowerCase())
          .join(", ")}.`,
      }

// Issue the NDC (services.ndc): a number, valid for the set days → { ok, number } | { error }
export async function issueNdc(code) {
  const { ctx, error } = await servicesAction("edit", "estate.ndc")
  if (error) return { error }
  const req = await getRequest(ctx, code)
  if (!req || req.type !== "ndc") return NOT_FOUND
  if (req.closed) return { error: "This request is already closed." }
  const notReady = readyOrError(req)
  if (notReady) return notReady
  const r = await byCode(ctx, code)
  let number
  await ctx.db.transaction(async (trx) => {
    number = await nextCode(trx, "ndc")
    const now = new Date()
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ status: "completed", closedAt: now, data: JSON.stringify({ ...json(r.data, {}), number, issuedAt: now, validDays: req.settings.ndc.validDays }), updatedAt: now, updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `NDC ${number} issued, valid for ${req.settings.ndc.validDays} days`, ctx.user.id)
    if (r.bookingId) await bookingEvent(trx, ctx, r.bookingId, "document", `NDC ${number} issued (${r.code})`)
  })
  await logActivity(ctx.db, { type: "estate", action: "ndc.issued", actorUserId: ctx.user.id, summary: `issued NDC ${number} (${r.code})` })
  return { ok: true, number }
}

// Start an NDC for a transfer's file → { ok, code } | { error }
export async function startNdcForTransfer(code) {
  const { ctx, error } = await servicesAction("create")
  if (error) return { error }
  const r = await byCode(ctx, code)
  if (!r || r.type !== "transfer" || !r.bookingId) return NOT_FOUND
  const b = await live(ctx.db, "bookings").where({ id: r.bookingId }).first("code")
  return createRequest({ type: "ndc", booking: b.code, subject: `NDC for transfer ${r.code}`, ndcPurpose: "transfer", channel: r.channel, assignTo: r.assignedTo ?? ctx.user.id })
}

// Complete a transfer (services.transfer) → { ok, letterNo } | { error }
export async function completeTransfer(code) {
  const { ctx, error } = await servicesAction("edit", "estate.transfer")
  if (error) return { error }
  const req = await getRequest(ctx, code)
  if (!req || req.type !== "transfer") return NOT_FOUND
  if (req.closed) return { error: "This transfer is already closed." }
  const notReady = readyOrError(req)
  if (notReady) return notReady
  const r = await byCode(ctx, code)
  const out = await performTransfer(ctx, r.id)
  if (out.ok) await closeTransferApproval(ctx.db, r.id, ctx.user.id, "approved")
  return out
}

// Without services.transfer: ask someone who can (Approvals in My Desk) → { ok } | { error }
export async function sendTransferForApproval(code, reason = "") {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const req = await getRequest(ctx, code)
  if (!req || req.type !== "transfer") return NOT_FOUND
  if (req.closed) return { error: "This transfer is already closed." }
  const notReady = readyOrError(req)
  if (notReady) return notReady
  const r = await byCode(ctx, code)
  if (await pendingFor(ctx.db, "service-request", r.id)) return { error: "It's already waiting for approval." }
  await createApproval(ctx.db, {
    type: "service-transfer",
    app: "estate",
    subjectType: "service-request",
    subjectId: r.id,
    title: `Transfer ${req.booking?.code ?? ""} to ${req.data.to?.name ?? "the purchaser"}`,
    details: `${req.contact?.name ?? "Owner"} → ${req.data.to?.name ?? "purchaser"} · ${req.unit ? `${req.unit.project.name} ${req.unit.number}` : ""}`.slice(0, 255),
    link: link(r.code),
    reason: String(reason ?? "").trim() || null,
    requestedBy: ctx.user.id,
  })
  await requestEvent(ctx.db, r.id, "system", "Sent for approval", ctx.user.id)
  return { ok: true }
}

// Hand over possession (services.possession): a possession letter number, and the file's
// booking moves to Completed → { ok, letterNo } | { error }
export async function handOverPossession(code) {
  const { ctx, error } = await servicesAction("edit", "estate.possession")
  if (error) return { error }
  const req = await getRequest(ctx, code)
  if (!req || req.type !== "possession") return NOT_FOUND
  if (req.closed) return { error: "This request is already closed." }
  const notReady = readyOrError(req)
  if (notReady) return notReady
  const r = await byCode(ctx, code)
  let letterNo
  await ctx.db.transaction(async (trx) => {
    letterNo = await nextCode(trx, "possession-letter")
    const now = new Date()
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ status: "completed", closedAt: now, data: JSON.stringify({ ...json(r.data, {}), letterNo, letterAt: now, handedOverAt: now }), updatedAt: now, updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `Possession handed over (${letterNo})`, ctx.user.id)
    if (r.bookingId) {
      await trx("bookings").where({ id: r.bookingId }).update({ stage: "completed", completedAt: now, updatedAt: now, updatedBy: ctx.user.id })
      await bookingEvent(trx, ctx, r.bookingId, "completed", `Possession given by Estate Management (${letterNo})`)
    }
  })
  await logActivity(ctx.db, { type: "estate", action: "possession.handed-over", actorUserId: ctx.user.id, summary: `handed over possession (${r.code}, ${letterNo})` })
  return { ok: true, letterNo }
}

// Start possession for a fully paid owner (from the Possession page's ready list) → { ok, code } | { error }
export async function startPossession(bookingCode) {
  return createRequest({ type: "possession", booking: bookingCode, subject: "Possession of the unit" })
}

// ---------- setup ----------

const money = z.coerce.number().min(0).max(10_000_000)
const days = z.coerce.number().int().min(1).max(365)
const settingsSchema = z.object({
  transfer: z.object({ perMarla: money, minimum: money, flat: money, days }),
  ndc: z.object({ fee: money, days, validDays: days }),
  possession: z.object({ fee: money, days }),
  document: z.object({ fees: z.record(z.string(), money), days }),
  "record-update": z.object({ fee: money, days }),
  complaint: z.object({
    hours: z.object({ urgent: z.coerce.number().int().min(1).max(720), high: z.coerce.number().int().min(1).max(720), normal: z.coerce.number().int().min(1).max(720), low: z.coerce.number().int().min(1).max(2000) }),
  }),
})

// Customize › Fees & timelines → { ok } | { error }. New requests use them; open ones keep theirs.
export async function saveServicesSettings(input) {
  const { ctx, error } = await servicesAction("edit")
  if (error) return { error }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  await writeSettings(ctx.tenant, { [SETTINGS_KEY]: parsed.data }, ctx.user.id)
  await logActivity(ctx.db, { type: "estate", action: "settings.saved", actorUserId: ctx.user.id, summary: "changed Estate Management fees and timelines" })
  return { ok: true }
}

// The NDC on a file, for the transfer's checklist hint → { ndc } (no write)
export async function ndcOnFile(bookingCode) {
  const { ctx, error } = await servicesAction("view")
  if (error) return { error }
  const b = await live(ctx.db, "bookings")
    .where({ code: String(bookingCode ?? "").toUpperCase() })
    .first("id")
  return { ndc: b ? await validNdc(ctx.db, b.id, await servicesSettings(ctx.db)) : null }
}
