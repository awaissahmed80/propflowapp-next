"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity as logToWorkspace } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { normalizePkMobile } from "@/lib/phone"
import { OPEN_STEPS, OUTCOMES, followUpAt } from "../constants"
import { peopleByIds } from "@/modules/users/server/queries"
import { crmAction, scoped } from "./context"
import { getLead } from "./queries"

// Leads: add (with a duplicate check on the mobile), edit, move along the statuses, give to
// someone, and record what happened (calls, WhatsApp, visits) or what's planned next.

// Pakistani mobiles as +923001234567; overseas numbers as +<country><number>
function normalizePhone(input) {
  const pk = normalizePkMobile(input)
  if (pk) return pk
  const d = String(input ?? "").replace(/[^\d+]/g, "")
  const digits = d.replace(/^\+|^00/, "")
  return /^(\+|00)/.test(d) && /^\d{8,15}$/.test(digits) ? `+${digits}` : null
}

const optionalText = (max) => z.string().trim().max(max).optional().default("")
const money = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(1e11).nullable())

const leadSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  phone: z.string().trim().min(1, "Enter their mobile number."),
  whatsapp: z.boolean().default(true),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.").max(150)]).optional().default(""),
  city: optionalText(80),
  overseas: z.boolean().default(false),
  source: optionalText(40),
  priority: z.string().max(20).optional().default("moderate"),
  projectCode: optionalText(12),
  unitType: optionalText(40),
  sizeValue: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().positive().max(100000).nullable()).optional(),
  sizeUnit: z.string().trim().max(20).nullable().optional(), // an Area units value
  budgetMin: money.optional(),
  budgetMax: money.optional(),
  paymentPlan: z.enum(["installments", "cash"]).nullable().optional(),
  purpose: z.enum(["investment", "living"]).nullable().optional(),
  notes: optionalText(4000),
  assignedTo: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable()).optional(),
})

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) })

async function leadByCode(ctx, code) {
  return scoped(ctx, live(ctx.db, "leads"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
}

// Team of the person a lead is given to, so team scopes see it
const teamOf = async (ctx, userId) => (userId ? ((await live(ctx.db, "members").where({ userId }).first("teamId"))?.teamId ?? null) : null)

// A note on the lead's timeline for changes nobody "did" as an activity (status, assignment)
const systemNote = (trx, ctx, leadId, notes) => trx("leadActivities").insert({ leadId, type: "system", status: "done", at: new Date(), doneAt: new Date(), by: ctx.user.id, notes, createdBy: ctx.user.id })

// Validated columns from the form (shared by add and edit)
async function columns(ctx, v) {
  const lists = await getLookups(ctx.db, ["lead-source", "lead-priority", "unit-type"])
  const project = v.projectCode ? await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id") : null
  if (v.projectCode && !project) return { fieldErrors: { projectCode: "That project was removed." } }
  if (v.source && !lists["lead-source"].some((x) => x.value === v.source)) return { fieldErrors: { source: "Pick a source." } }
  if (v.budgetMin && v.budgetMax && v.budgetMin > v.budgetMax) return { fieldErrors: { budgetMax: "Up to should be more than From." } }
  const phone = normalizePhone(v.phone)
  if (!phone) return { fieldErrors: { phone: "Enter a mobile like 0300 1234567, or +44… for overseas." } }
  return {
    row: {
      name: v.name,
      phone,
      whatsapp: v.whatsapp,
      email: v.email || null,
      city: v.city || null,
      overseas: v.overseas || !phone.startsWith("+92"),
      source: v.source || null,
      priority: isLookupValue(lists["lead-priority"], v.priority) ? v.priority : "moderate",
      projectId: project?.id ?? null,
      unitType: v.unitType && isLookupValue(lists["unit-type"], v.unitType) ? v.unitType : null,
      sizeValue: v.sizeValue ?? null,
      sizeUnit: v.sizeValue ? (v.sizeUnit ?? "marla") : null,
      budgetMin: v.budgetMin ?? null,
      budgetMax: v.budgetMax ?? null,
      paymentPlan: v.paymentPlan ?? null,
      purpose: v.purpose ?? null,
      notes: v.notes || null,
    },
  }
}

// Leads already on this number (anyone's, so nobody adds a lead someone else is working)
export async function findByPhone(phone) {
  const { ctx, error } = await crmAction("view")
  if (error) return { error }
  const p = normalizePhone(phone)
  if (!p) return { leads: [] }
  const rows = await live(ctx.db, "leads").where({ phone: p }).orderBy("createdAt", "desc").limit(5).select("code", "name", "status", "projectId", "assignedTo", "createdAt")
  const projects = rows.length ? await ctx.db("projects").whereIn("id", rows.map((r) => r.projectId).filter(Boolean)).select("id", "name") : []
  const visible = new Set((await scoped(ctx, live(ctx.db, "leads")).where({ phone: p }).select("code")).map((r) => r.code))
  return {
    leads: rows.map((r) => ({ code: visible.has(r.code) ? r.code : null, name: r.name, status: r.status, project: projects.find((x) => x.id === r.projectId)?.name ?? null, createdAt: r.createdAt })),
  }
}

// New lead → { ok, code } | { duplicate: [...] } (unless force) | { error, fieldErrors }
export async function createLead(input, { force = false } = {}) {
  const { ctx, error } = await crmAction("create")
  if (error) return { error }
  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const c = await columns(ctx, v)
  if (c.fieldErrors) return c
  // Assigning to someone else needs the reassign grant; otherwise the lead is yours
  const assignedTo = v.assignedTo && v.assignedTo !== ctx.user.id ? (ctx.canReassign ? v.assignedTo : null) : ctx.user.id
  if (v.assignedTo && v.assignedTo !== ctx.user.id && !ctx.canReassign) return { fieldErrors: { assignedTo: "Your role can't give leads to other people." } }
  if (!force) {
    const open = await live(ctx.db, "leads").where({ phone: c.row.phone }).whereNotIn("status", ["booked", "lost"]).first("code")
    if (open) return { duplicate: (await findByPhone(c.row.phone)).leads }
  }
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "lead")
    const [id] = await trx("leads").insert({ ...c.row, code, status: "new", assignedTo, teamId: await teamOf(ctx, assignedTo), createdBy: ctx.user.id })
    // A first call for whoever has it, so it shows in their follow-ups straight away
    if (assignedTo) await trx("leadActivities").insert({ leadId: id, type: "call", status: "planned", at: new Date(Date.now() + 2 * 3_600_000), by: assignedTo, notes: "First call", createdBy: ctx.user.id })
  })
  await logToWorkspace(ctx.db, { type: "crm", action: "lead.created", actorUserId: ctx.user.id, summary: `added the lead ${v.name} (${code})` })
  return { ok: true, code }
}

// Change a lead's details (contact, interest, source, notes)
export async function updateLead(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const c = await columns(ctx, parsed.data)
  if (c.fieldErrors) return c
  await ctx.db("leads")
    .where({ id: lead.id })
    .update({ ...c.row, updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// Move a lead to a status. Lost needs a reason; Booked and Lost close it (planned items are dropped).
export async function setLeadStatus(code, status, { lossReason } = {}) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  const lists = await getLookups(ctx.db, ["lead-status", "loss-reason"])
  const s = lists["lead-status"].find((x) => x.value === status)
  if (!s) return { error: "Pick a status." }
  if (status === "lost" && !isLookupValue(lists["loss-reason"], lossReason)) return { error: "Pick why it was lost." }
  if (status === lead.status) return { ok: true }
  const closing = ["booked", "lost"].includes(status)
  await ctx.db.transaction(async (trx) => {
    await trx("leads")
      .where({ id: lead.id })
      .update({ status, lossReason: status === "lost" ? lossReason : null, closedAt: closing ? new Date() : null, updatedAt: new Date(), updatedBy: ctx.user.id })
    if (closing) await trx("leadActivities").where({ leadId: lead.id, status: "planned" }).update({ status: "missed", updatedAt: new Date(), updatedBy: ctx.user.id })
    const from = lists["lead-status"].find((x) => x.value === lead.status)?.label ?? lead.status
    const reason = status === "lost" ? ` (${lists["loss-reason"].find((x) => x.value === lossReason)?.label})` : ""
    await systemNote(trx, ctx, lead.id, `Status: ${from} → ${s.label}${reason}`)
  })
  return { ok: true }
}

export async function setLeadPriority(code, priority) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (!isLookupValue((await getLookups(ctx.db, ["lead-priority"]))["lead-priority"], priority)) return { error: "Pick a temperature." }
  await ctx.db("leads").where({ id: lead.id }).update({ priority, updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// Give leads to someone (or nobody). Needs the reassign grant, except taking an unassigned lead.
export async function assignLeads(codes, userId) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const to = userId ? Number(userId) : null
  const leads = await scoped(ctx, live(ctx.db, "leads"))
    .whereIn("code", (Array.isArray(codes) ? codes : [codes]).map((c) => String(c).toUpperCase()))
    .select("id", "assignedTo")
  if (!leads.length) return { error: "Those leads weren't found." }
  const selfTake = to === ctx.user.id && leads.every((l) => !l.assignedTo)
  if (!ctx.canReassign && !selfTake) return { error: "Your role can't give leads to other people." }
  if (to && !(await live(ctx.db, "members").where({ userId: to }).first("userId"))) return { error: "That person isn't in this workspace." }
  const team = await teamOf(ctx, to)
  const people = to ? await peopleByIds([to]) : new Map()
  await ctx.db.transaction(async (trx) => {
    for (const l of leads) {
      if (l.assignedTo === to) continue
      await trx("leads").where({ id: l.id }).update({ assignedTo: to, teamId: team, updatedAt: new Date(), updatedBy: ctx.user.id })
      // Their planned follow-ups move with the lead
      await trx("leadActivities").where({ leadId: l.id, status: "planned" }).update({ by: to })
      await systemNote(trx, ctx, l.id, to ? `Given to ${people.get(to)?.name ?? "someone"}` : "Unassigned")
    }
  })
  return { ok: true, changed: leads.length }
}

const activitySchema = z.object({
  type: z.string().min(1).max(40),
  outcome: z.string().max(60).optional().default(""),
  notes: optionalText(4000),
  // Planned: when it's due ("yyyy-MM-ddTHH:mm" in Pakistan time) or a preset
  at: z.string().optional(),
  next: z.enum(["", "tomorrow", "3-days", "next-week"]).optional().default(""),
  projectCode: optionalText(12),
})

const pkDate = (s) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+05:00`) : null)

// Record something that happened on a lead (inside ctx's checks). plannedId: the planned item
// it completes, if any. The status moves forward on its own: any contact makes a new lead
// Contacted; an Interested answer makes it Interested; a site visit makes it Site visit.
async function record(ctx, lead, v, plannedId = null) {
  const lists = await getLookups(ctx.db, ["activity-type", "lead-status"])
  if (!isLookupValue(lists["activity-type"], v.type)) return { error: "Pick what you did." }
  const project = v.projectCode ? await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id") : null
  const now = new Date()
  const outcome = OUTCOMES.find((o) => o.value === v.outcome)
  const reached = outcome?.value !== "no-answer"
  // Forward only: never moves a lead back, never past Negotiation
  const target = v.type === "site-visit" ? "site-visit" : reached ? (outcome?.moves ?? "contacted") : null
  const forward = target && OPEN_STEPS.includes(lead.status) && OPEN_STEPS.indexOf(target) > OPEN_STEPS.indexOf(lead.status) ? target : null
  const label = (st) => lists["lead-status"].find((x) => x.value === st)?.label ?? st
  await ctx.db.transaction(async (trx) => {
    const done = { status: "done", doneAt: now, by: ctx.user.id, outcome: v.outcome || null, notes: v.notes || null }
    if (plannedId) await trx("leadActivities").where({ id: plannedId }).update({ ...done, ...(project ? { projectId: project.id } : {}), updatedAt: now, updatedBy: ctx.user.id })
    else await trx("leadActivities").insert({ leadId: lead.id, type: v.type, at: now, projectId: project?.id ?? null, ...done, createdBy: ctx.user.id })
    await trx("leads")
      .where({ id: lead.id })
      .update({ ...(forward ? { status: forward } : {}), ...(reached ? { lastContactAt: now, firstContactAt: lead.firstContactAt ?? now } : {}), updatedAt: now, updatedBy: ctx.user.id })
    if (forward) await systemNote(trx, ctx, lead.id, `Status: ${label(lead.status)} → ${label(forward)}`)
    if (v.next) await trx("leadActivities").insert({ leadId: lead.id, type: v.type === "site-visit" ? "call" : v.type, status: "planned", at: followUpAt(v.next, now), by: lead.assignedTo ?? ctx.user.id, createdBy: ctx.user.id })
  })
  return { ok: true, status: forward ?? lead.status }
}

// Something happened just now (a call, WhatsApp, meeting…), with an optional next follow-up.
// It also completes a follow-up that was due within the next few hours.
export async function logLeadActivity(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  const parsed = activitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const due = await live(ctx.db, "leadActivities").where({ leadId: lead.id, status: "planned", type: parsed.data.type }).where("at", "<=", new Date(Date.now() + 6 * 3_600_000)).orderBy("at").first("id")
  return record(ctx, lead, parsed.data, due?.id ?? null)
}

// Plan a follow-up or site visit
export async function planLeadActivity(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  const parsed = activitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const lists = await getLookups(ctx.db, ["activity-type"])
  if (!isLookupValue(lists["activity-type"], v.type)) return { error: "Pick what to do." }
  const at = v.next ? followUpAt(v.next) : pkDate(v.at)
  if (!at) return { error: "Pick when." }
  const project = v.projectCode ? await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id") : null
  if (v.type === "site-visit" && !project && !lead.projectId) return { error: "Pick the project they'll visit." }
  await ctx.db.transaction(async (trx) => {
    await trx("leadActivities").insert({ leadId: lead.id, type: v.type, status: "planned", at, by: lead.assignedTo ?? ctx.user.id, notes: v.notes || null, projectId: v.type === "site-visit" ? (project?.id ?? lead.projectId) : null, createdBy: ctx.user.id })
    // A planned visit is what "Site visit scheduled" means
    if (v.type === "site-visit" && OPEN_STEPS.indexOf(lead.status) >= 0 && OPEN_STEPS.indexOf(lead.status) < OPEN_STEPS.indexOf("site-visit")) {
      await trx("leads").where({ id: lead.id }).update({ status: "site-visit", updatedAt: new Date(), updatedBy: ctx.user.id })
      await systemNote(trx, ctx, lead.id, "Status → Site visit scheduled")
    }
  })
  return { ok: true }
}

// A planned item: done (with an outcome), moved to another time, or missed (no-show)
export async function updatePlannedActivity(code, activityId, { action, outcome = "", notes = "", next = "" } = {}) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  const a = await live(ctx.db, "leadActivities").where({ id: Number(activityId), leadId: lead.id, status: "planned" }).first()
  if (!a) return { error: "It was already done or removed." }
  const now = new Date()
  if (action === "done") return record(ctx, lead, { type: a.type, outcome, notes, next, projectCode: "" }, a.id)
  if (action === "reschedule") {
    if (!next) return { error: "Pick when." }
    await ctx.db("leadActivities").where({ id: a.id }).update({ at: followUpAt(next, now), updatedAt: now, updatedBy: ctx.user.id })
    return { ok: true }
  }
  if (action === "missed") {
    await ctx.db("leadActivities").where({ id: a.id }).update({ status: "missed", doneAt: now, notes: [a.notes, notes].filter(Boolean).join(" · ") || null, updatedAt: now, updatedBy: ctx.user.id })
    return { ok: true }
  }
  if (action === "cancel") {
    await ctx.db("leadActivities").where({ id: a.id }).update({ deletedAt: now, deletedBy: ctx.user.id })
    return { ok: true }
  }
  return { error: "Unknown action." }
}

// One lead for the lead window (with its planned items and history)
export async function loadLead(code) {
  const { ctx, error } = await crmAction("view")
  if (error) return { error }
  const lead = await getLead(ctx, code)
  return lead ? { lead } : { error: "That lead was removed or isn't yours to see." }
}
