"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity as logToWorkspace } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { normalizePhone } from "@/lib/phone"
import { OPEN_STEPS, OUTCOMES, followUpAt } from "../constants"
import { listMembers, peopleByIds } from "@/modules/users/server/queries"
import { crmAction, scoped } from "./context"
import { crmSettings } from "./settings"
import { sendWorkspaceMail, smtpReady } from "@/server/mail/workspace-smtp"
import { storeAsset } from "@/server/assets"
import { AUDIO_TYPES, VOICE_MAX_BYTES, detectFileType } from "@/server/storage/file-types"
import { assignableAgents, getLead } from "./queries"
import { nextInTurn, pickByRules } from "./assignment"
import { canTagLead, isManager, taggable } from "./tagging"
import { bookingEvent } from "@/modules/operations/server/activity"
import { routeBooking } from "@/modules/operations/server/assignment"
import { dealerTerms } from "@/modules/operations/server/commissions"
import { ensureContact, linkContact, relinkContact } from "@/modules/contacts/server/links"

// Leads: add (with a duplicate check on the mobile), edit, move along the statuses, give to
// someone, and record what happened (calls, WhatsApp, visits) or what's planned next.

// Pakistani mobiles as +923001234567; overseas numbers as +<country><number>

const optionalText = (max) => z.string().trim().max(max).optional().default("")
const money = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(1e11).nullable())

const leadSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  phone: z.string().trim().min(1, "Enter their mobile number."),
  whatsapp: z.boolean().default(true),
  email: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email.").max(150)])
    .optional()
    .default(""),
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
  const rows = await live(ctx.db, "leads").where({ phone: p }).orderBy("createdAt", "desc").limit(5).select("code", "name", "status", "projectId", "assignedTo", "createdAt", "archivedAt")
  const projects = rows.length
    ? await ctx
        .db("projects")
        .whereIn("id", rows.map((r) => r.projectId).filter(Boolean))
        .select("id", "name")
    : []
  const visible = new Set((await scoped(ctx, live(ctx.db, "leads")).where({ phone: p }).select("code")).map((r) => r.code))
  return {
    leads: rows.map((r) => ({
      code: visible.has(r.code) ? r.code : null,
      name: r.name,
      status: r.status,
      project: projects.find((x) => x.id === r.projectId)?.name ?? null,
      createdAt: r.createdAt,
      archived: Boolean(r.archivedAt),
    })),
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
  // Assigning to someone else needs the reassign grant. Nobody picked: the assignment rules
  // (CRM › Customize › Assignment rules), then round-robin when the workspace auto-assigns (Settings › CRM),
  // otherwise the lead is yours.
  if (v.assignedTo && v.assignedTo !== ctx.user.id && !ctx.canReassign) return { fieldErrors: { assignedTo: "Your role can't give leads to other people." } }
  if (!force) {
    const open = await live(ctx.db, "leads").where({ phone: c.row.phone }).whereNotIn("status", ["booked", "lost"]).first("code")
    if (open) return { duplicate: (await findByPhone(c.row.phone)).leads }
  }
  const prefs = await crmSettings(ctx.db)
  const byRule = v.assignedTo ? null : await pickByRules(ctx, c.row)
  const assignedTo = v.assignedTo ? v.assignedTo : (byRule?.userId ?? (prefs.autoAssign ? ((await nextInTurn(ctx)) ?? ctx.user.id) : ctx.user.id))
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "lead")
    const [id] = await trx("leads").insert({ ...c.row, code, status: "new", assignedTo, teamId: await teamOf(ctx, assignedTo), createdBy: ctx.user.id })
    // The person behind it, in the central contacts (one per mobile)
    await linkContact(trx, await ensureContact(trx, c.row, ctx.user.id), { type: "lead", id, role: "lead" }, ctx.user.id)
    if (byRule) await systemNote(trx, ctx, id, `Given to ${(await assignableAgents(ctx)).find((a) => a.id === byRule.userId)?.name ?? "someone"} by the rule “${byRule.rule}”`)
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
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const c = await columns(ctx, parsed.data)
  if (c.fieldErrors) return c
  await ctx.db.transaction(async (trx) => {
    await trx("leads")
      .where({ id: lead.id })
      .update({ ...c.row, updatedAt: new Date(), updatedBy: ctx.user.id })
    // A corrected mobile moves the lead to that person's contact
    await relinkContact(trx, await ensureContact(trx, c.row, ctx.user.id), { type: "lead", id: lead.id, role: "lead" }, ctx.user.id)
  })
  return { ok: true }
}

// Move a lead to a status. Lost needs a reason; Booked and Lost close it (planned items are dropped).
// note: the update the person gave; required when Settings › CRM asks for one
export async function setLeadStatus(code, status, { lossReason, note = "" } = {}) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  const lists = await getLookups(ctx.db, ["lead-status", "loss-reason"])
  const s = lists["lead-status"].find((x) => x.value === status)
  if (!s) return { error: "Pick a status." }
  if (status === "lost" && !isLookupValue(lists["loss-reason"], lossReason)) return { error: "Pick why it was lost." }
  if (status === lead.status) return { ok: true }
  const update = String(note ?? "")
    .trim()
    .slice(0, 2000)
  if (!update && (await crmSettings(ctx.db)).statusNote) return { error: "Add a short update: what happened that changed the status?" }
  const closing = ["booked", "lost"].includes(status)
  await ctx.db.transaction(async (trx) => {
    await trx("leads")
      .where({ id: lead.id })
      .update({ status, lossReason: status === "lost" ? lossReason : null, closedAt: closing ? new Date() : null, updatedAt: new Date(), updatedBy: ctx.user.id })
    if (closing) await trx("leadActivities").where({ leadId: lead.id, status: "planned" }).update({ status: "missed", updatedAt: new Date(), updatedBy: ctx.user.id })
    const from = lists["lead-status"].find((x) => x.value === lead.status)?.label ?? lead.status
    const reason = status === "lost" ? ` (${lists["loss-reason"].find((x) => x.value === lossReason)?.label})` : ""
    // The update, if any, follows the status line (the history shows it as a note under it)
    await systemNote(trx, ctx, lead.id, `Status: ${from} → ${s.label}${reason}${update ? `\n\n${update}` : ""}`)
  })
  return { ok: true }
}

export async function setLeadPriority(code, priority) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  if (!isLookupValue((await getLookups(ctx.db, ["lead-priority"]))["lead-priority"], priority)) return { error: "Pick a temperature." }
  await ctx.db("leads").where({ id: lead.id }).update({ priority, updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// Tagging people on a lead (they see it too). The assignee tags people in their own team; someone
// who can reassign leads (or sees every lead) tags anyone. Only active staff whose role opens CRM.
// A colleague's card (the agent avatar on a lead): who they are and how busy → { card } | { error }
export async function loadAgentCard(userId) {
  const { ctx, error } = await crmAction("view")
  if (error) return { error }
  const id = Number(userId)
  const m = (await listMembers(ctx)).find((x) => x.id === id)
  if (!m) return { error: "They're no longer in this workspace." }
  const endOfToday = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())}T23:59:59+05:00`)
  const [open, due, booked] = await Promise.all([
    live(ctx.db, "leads").where({ assignedTo: id }).whereNull("archivedAt").whereNotIn("status", ["booked", "lost"]).count({ n: "id" }).first(),
    ctx
      .db("leadActivities as a")
      .join("leads as l", "l.id", "a.leadId")
      .whereNull("a.deletedAt")
      .whereNull("l.deletedAt")
      .whereNull("l.archivedAt")
      .where({ "a.status": "planned", "a.by": id })
      .where("a.at", "<=", endOfToday)
      .count({ n: "a.id" })
      .first(),
    live(ctx.db, "leads")
      .where({ assignedTo: id, status: "booked" })
      .where("closedAt", ">=", new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()).slice(0, 7)}-01T00:00:00+05:00`))
      .count({ n: "id" })
      .first(),
  ])
  const designation = m.designation ? ((await getLookups(ctx.db, ["designation"])).designation.find((d) => d.value === m.designation)?.label ?? null) : null
  return {
    card: {
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      role: m.role,
      designation,
      team: m.team?.name ?? null,
      phone: m.phone ?? null,
      email: m.email ?? null,
      status: m.status,
      lastActiveAt: m.lastActiveAt ?? null,
      open: Number(open?.n ?? 0),
      dueToday: Number(due?.n ?? 0),
      bookedThisMonth: Number(booked?.n ?? 0),
    },
  }
}

// The people who can be tagged on this lead, and who already is → { people, note? } | { error }
export async function loadTagOptions(code) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (!canTagLead(ctx, lead)) return { error: "Only whoever has this lead (or a manager) can tag people on it." }
  const [people, tagged] = await Promise.all([taggable(ctx, lead), live(ctx.db, "leadTags").where({ leadId: lead.id }).select("userId")])
  const on = new Set(tagged.map((t) => t.userId))
  return {
    people: people.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null, team: m.team?.name ?? null, tagged: on.has(m.id) })),
    note: !people.length ? (isManager(ctx) ? "Nobody else in the workspace can open CRM yet." : "Nobody else is in your team yet. Ask a manager to add teammates.") : null,
  }
}

// Tag (on) or untag someone → { ok } | { error }
export async function setLeadTag(code, userId, on) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (!canTagLead(ctx, lead)) return { error: "Only whoever has this lead (or a manager) can tag people on it." }
  const id = Number(userId)
  const existing = await live(ctx.db, "leadTags").where({ leadId: lead.id, userId: id }).first("id")
  const person = (await listMembers(ctx)).find((m) => m.id === id)
  const now = new Date()
  if (on) {
    if (existing) return { ok: true }
    if (!(await taggable(ctx, lead)).some((m) => m.id === id)) return { error: "You can't tag that person on this lead." }
    await ctx.db.transaction(async (trx) => {
      await trx("leadTags").insert({ leadId: lead.id, userId: id, createdBy: ctx.user.id })
      await systemNote(trx, ctx, lead.id, `Tagged ${person?.name ?? "someone"}`)
    })
  } else {
    if (!existing) return { ok: true }
    await ctx.db.transaction(async (trx) => {
      await trx("leadTags").where({ id: existing.id }).update({ deletedAt: now, deletedBy: ctx.user.id })
      await systemNote(trx, ctx, lead.id, `Untagged ${person?.name ?? "someone"}`)
    })
  }
  return { ok: true }
}

// Bulk (leads list): the selected leads this person may see that are in the pipeline
async function pickLeads(ctx, codes) {
  const list = (Array.isArray(codes) ? codes : [codes]).map((c) => String(c).toUpperCase()).slice(0, 1000)
  return list.length ? scoped(ctx, live(ctx.db, "leads")).whereIn("code", list).whereNull("archivedAt").select("id", "name", "status") : []
}
const howMany = (n) => `${n} ${n === 1 ? "lead" : "leads"}`

// Move several leads to one status → { ok, count } | { error }. Booking needs a unit, so Booked
// goes lead by lead through Close deal; Lost needs a reason; the update follows Settings › CRM.
export async function setLeadsStatus(codes, status, { lossReason, note = "" } = {}) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  if (status === "booked") return { error: "Book leads one at a time, from the lead's Close deal tab." }
  const lists = await getLookups(ctx.db, ["lead-status", "loss-reason"])
  const s = lists["lead-status"].find((x) => x.value === status)
  if (!s) return { error: "Pick a status." }
  if (status === "lost" && !isLookupValue(lists["loss-reason"], lossReason)) return { error: "Pick why they were lost." }
  const update = String(note ?? "")
    .trim()
    .slice(0, 2000)
  if (!update && (await crmSettings(ctx.db)).statusNote) return { error: "Add a short update: what happened that changed the status?" }
  const leads = (await pickLeads(ctx, codes)).filter((l) => l.status !== status)
  if (!leads.length) return { error: `Those leads are already ${s.label}, archived, or weren't found.` }
  const now = new Date()
  const label = (v) => lists["lead-status"].find((x) => x.value === v)?.label ?? v
  const reason = status === "lost" ? ` (${lists["loss-reason"].find((x) => x.value === lossReason)?.label})` : ""
  await ctx.db.transaction(async (trx) => {
    const ids = leads.map((l) => l.id)
    await trx("leads")
      .whereIn("id", ids)
      .update({ status, lossReason: status === "lost" ? lossReason : null, closedAt: status === "lost" ? now : null, updatedAt: now, updatedBy: ctx.user.id })
    if (status === "lost") await trx("leadActivities").whereIn("leadId", ids).where({ status: "planned" }).update({ status: "missed", updatedAt: now, updatedBy: ctx.user.id })
    for (const l of leads) await systemNote(trx, ctx, l.id, `Status: ${label(l.status)} → ${s.label}${reason}${update ? `\n\n${update}` : ""}`)
  })
  await logToWorkspace(ctx.db, { type: "crm", action: "lead.bulk_status", actorUserId: ctx.user.id, summary: `moved ${howMany(leads.length)} to ${s.label}` })
  return { ok: true, count: leads.length }
}

// Set the temperature of several leads → { ok, count } | { error }
export async function setLeadsPriority(codes, priority) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  if (!isLookupValue((await getLookups(ctx.db, ["lead-priority"]))["lead-priority"], priority)) return { error: "Pick a temperature." }
  const leads = await pickLeads(ctx, codes)
  if (!leads.length) return { error: "Those leads are archived, or weren't found." }
  await ctx
    .db("leads")
    .whereIn(
      "id",
      leads.map((l) => l.id),
    )
    .update({ priority, updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true, count: leads.length }
}

// Archive leads (out of the pipeline, kept as they are) or bring them back → { ok, count } | { error }
//   note: optional, why it was archived (on the lead's timeline)
export async function archiveLeads(codes, { archive = true, note = "" } = {}) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const leads = await scoped(ctx, live(ctx.db, "leads"))
    .whereIn(
      "code",
      (Array.isArray(codes) ? codes : [codes]).map((c) => String(c).toUpperCase()),
    )
    [archive ? "whereNull" : "whereNotNull"]("archivedAt")
    .select("id", "name")
  if (!leads.length) return { error: archive ? "Those leads are already archived, or weren't found." : "Those leads aren't archived, or weren't found." }
  const now = new Date()
  const why = String(note ?? "")
    .trim()
    .slice(0, 1000)
  await ctx.db.transaction(async (trx) => {
    await trx("leads")
      .whereIn(
        "id",
        leads.map((l) => l.id),
      )
      .update({ archivedAt: archive ? now : null, archivedBy: archive ? ctx.user.id : null, updatedAt: now, updatedBy: ctx.user.id })
    for (const l of leads) await systemNote(trx, ctx, l.id, `${archive ? "Archived" : "Restored to the pipeline"}${why ? `\n\n${why}` : ""}`)
  })
  await logToWorkspace(ctx.db, {
    type: "crm",
    action: archive ? "lead.archived" : "lead.restored",
    actorUserId: ctx.user.id,
    summary: `${archive ? "archived" : "restored"} ${leads.length === 1 ? leads[0].name : `${leads.length} leads`}`,
  })
  return { ok: true, count: leads.length }
}

// Give leads to someone (or nobody). Needs the reassign grant, except taking an unassigned lead.
export async function assignLeads(codes, userId) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const to = userId ? Number(userId) : null
  const leads = await scoped(ctx, live(ctx.db, "leads"))
    .whereIn(
      "code",
      (Array.isArray(codes) ? codes : [codes]).map((c) => String(c).toUpperCase()),
    )
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
  next: z.string().max(40).optional().default(""), // a value from the Follow-up options list
  nextType: z.string().max(40).optional().default(""), // how to follow up: an Activity types value
  // What time to follow up ("14:30", Pakistan time); empty = 11 AM
  nextTime: z
    .string()
    .regex(/^(\d{2}:\d{2})?$/)
    .optional()
    .default(""),
  // A status change made with this log (Settings › CRM asks for a note with every change)
  statusTo: z.string().max(40).optional().default(""),
  lossReason: z.string().max(40).optional().default(""),
  projectCode: optionalText(12),
})

const pkDate = (s) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+05:00`) : null)

// Record something that happened on a lead (inside ctx's checks). plannedId: the planned item
// it completes, if any. The status moves forward on its own: any contact makes a new lead
// Contacted; an Interested answer makes it Interested; a site visit makes it Site visit.
// A Follow-up options value → days later (null when it isn't one); old preset names still work
function followUpDays(list, value) {
  const v = list.find((x) => x.value === value && x.isActive)
  const days = Number(v?.meta?.days)
  if (v && Number.isFinite(days)) return days
  return { tomorrow: 1, "3-days": 3, "next-week": 7 }[value] ?? null
}

// An Activity outcomes value → { moves, reached }; built-in rules if the list hasn't reached
// this workspace yet
function outcomeRule(list, value) {
  const v = list.find((x) => x.value === value)
  if (v) return { moves: OPEN_STEPS.includes(v.meta?.moves) ? v.meta.moves : "", reached: v.meta?.reached !== "no" }
  const o = OUTCOMES.find((x) => x.value === value)
  return { moves: o?.moves ?? "", reached: value !== "no-answer" }
}

// A voice note from the form (FormData "voice"), checked before anything is saved
async function readVoice(form) {
  const file = form?.get?.("voice")
  if (!file || typeof file !== "object" || !file.size) return { file: null }
  if (file.size > VOICE_MAX_BYTES) return { error: "That voice note is too long. Keep it under about 5 minutes." }
  const type = detectFileType(Buffer.from(await file.slice(0, 16).arrayBuffer()))
  if (!type || !AUDIO_TYPES.includes(type.mime)) return { error: "That voice note couldn't be read. Record it again." }
  return { file }
}

// Open (planned) tasks on a lead → done, except the one being completed. Used when a new
// activity is logged or a new follow-up is added, so earlier tasks don't hang around.
async function closeOpenTasks(trx, ctx, leadId, now = new Date(), exceptId = null) {
  let q = trx("leadActivities").where({ leadId, status: "planned" }).whereNull("deletedAt")
  if (exceptId) q = q.whereNot({ id: exceptId })
  await q.update({ status: "done", doneAt: now, by: ctx.user.id, updatedAt: now, updatedBy: ctx.user.id })
}

async function record(ctx, lead, v, plannedId = null, voice = null) {
  const lists = await getLookups(ctx.db, ["activity-type", "lead-status", "activity-outcome", "follow-up", "loss-reason"])
  if (!isLookupValue(lists["activity-type"], v.type)) return { error: "Pick what you did." }
  // Moving the lead with this log: a real status; Lost says why; the note (or voice note) is required
  const statusTo = v.statusTo && v.statusTo !== lead.status ? v.statusTo : ""
  if (statusTo) {
    if (!isLookupValue(lists["lead-status"], statusTo)) return { error: "Pick a status." }
    if (statusTo === "lost" && !isLookupValue(lists["loss-reason"], v.lossReason)) return { error: "Pick why it was lost." }
    if (!String(v.notes ?? "").trim() && !voice) return { error: "Add a note (or a voice note) about what happened." }
  }
  const closing = ["booked", "lost"].includes(statusTo)
  const nextDays = v.next ? followUpDays(lists["follow-up"], v.next) : null
  if (v.next && nextDays === null) return { error: "Pick when to follow up." }
  // How to follow up: the type picked, if it's active; otherwise the same kind (a visit → a call)
  const nextType = v.nextType && isLookupValue(lists["activity-type"], v.nextType) ? v.nextType : v.type === "site-visit" ? "call" : v.type
  const project = v.projectCode ? await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id") : null
  const now = new Date()
  // From the Activity outcomes list: where it moves the lead, and whether we reached them
  const outcome = outcomeRule(lists["activity-outcome"], v.outcome)
  const reached = outcome.reached
  // Forward only: never moves a lead back, never past Negotiation
  const target = v.type === "site-visit" ? "site-visit" : reached ? outcome.moves || "contacted" : null
  // A status picked by hand wins over the automatic move
  const forward = statusTo ? null : target && OPEN_STEPS.includes(lead.status) && OPEN_STEPS.indexOf(target) > OPEN_STEPS.indexOf(lead.status) ? target : null
  const label = (st) => lists["lead-status"].find((x) => x.value === st)?.label ?? st
  let activityId = plannedId
  await ctx.db.transaction(async (trx) => {
    const done = { status: "done", doneAt: now, by: ctx.user.id, outcome: v.outcome || null, notes: v.notes || null }
    if (plannedId)
      await trx("leadActivities")
        .where({ id: plannedId })
        .update({ ...done, type: v.type, ...(project ? { projectId: project.id } : {}), updatedAt: now, updatedBy: ctx.user.id })
    else [activityId] = await trx("leadActivities").insert({ leadId: lead.id, type: v.type, at: now, projectId: project?.id ?? null, ...done, createdBy: ctx.user.id })
    // Anything else still open is done now too: one open next step at a time
    await closeOpenTasks(trx, ctx, lead.id, now, plannedId)
    await trx("leads")
      .where({ id: lead.id })
      .update({ ...(forward ? { status: forward } : {}), ...(reached ? { lastContactAt: now, firstContactAt: lead.firstContactAt ?? now } : {}), updatedAt: now, updatedBy: ctx.user.id })
    if (forward) await systemNote(trx, ctx, lead.id, `Status: ${label(lead.status)} → ${label(forward)}`)
    // The status picked by hand; the activity just logged is its note, so it isn't repeated
    if (statusTo) {
      await trx("leads")
        .where({ id: lead.id })
        .update({ status: statusTo, lossReason: statusTo === "lost" ? v.lossReason : null, closedAt: closing ? now : null, updatedAt: now, updatedBy: ctx.user.id })
      const reason = statusTo === "lost" ? ` (${lists["loss-reason"].find((x) => x.value === v.lossReason)?.label ?? v.lossReason})` : ""
      await systemNote(trx, ctx, lead.id, `Status: ${label(lead.status)} → ${label(statusTo)}${reason}`)
    }
    // Closed leads get no next follow-up
    if (v.next && !closing)
      await trx("leadActivities").insert({ leadId: lead.id, type: nextType, status: "planned", at: followUpAt(nextDays, now, v.nextTime || "11:00"), by: lead.assignedTo ?? ctx.user.id, createdBy: ctx.user.id })
  })
  // The voice note rides along with the activity it was recorded for
  if (voice) await storeAsset(ctx.db, ctx.tenant, { app: "crm", ownerType: "lead-activity", ownerId: activityId, collection: "voice", title: "Voice note", file: voice, allowed: AUDIO_TYPES, userId: ctx.user.id })
  return { ok: true, status: statusTo || forward || lead.status }
}

// Something happened just now (a call, WhatsApp, meeting…), with an optional next follow-up.
// It also completes a follow-up that was due within the next few hours.
// form: optional FormData with a "voice" note recorded in the composer
export async function logLeadActivity(code, input, form = null) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  const parsed = activitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  // A new activity completes what was planned: the earliest open task becomes this activity
  // (record() closes any other open ones too)
  const due = await live(ctx.db, "leadActivities").where({ leadId: lead.id, status: "planned" }).orderBy("at").first("id")
  const voice = await readVoice(form)
  if (voice.error) return { error: voice.error }
  return record(ctx, lead, parsed.data, due?.id ?? null, voice.file)
}

// Plan a follow-up or site visit
export async function planLeadActivity(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  const parsed = activitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const lists = await getLookups(ctx.db, ["activity-type"])
  if (!isLookupValue(lists["activity-type"], v.type)) return { error: "Pick what to do." }
  const days = v.next ? followUpDays((await getLookups(ctx.db, ["follow-up"]))["follow-up"], v.next) : null
  const at = v.next ? (days === null ? null : followUpAt(days)) : pkDate(v.at)
  if (!at) return { error: "Pick when." }
  const project = v.projectCode ? await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id") : null
  if (v.type === "site-visit" && !project && !lead.projectId) return { error: "Pick the project they'll visit." }
  await ctx.db.transaction(async (trx) => {
    // A new follow-up replaces what was open
    await closeOpenTasks(trx, ctx, lead.id)
    await trx("leadActivities").insert({
      leadId: lead.id,
      type: v.type,
      status: "planned",
      at,
      by: lead.assignedTo ?? ctx.user.id,
      notes: v.notes || null,
      projectId: v.type === "site-visit" ? (project?.id ?? lead.projectId) : null,
      createdBy: ctx.user.id,
    })
    // A planned visit is what "Site visit scheduled" means
    if (v.type === "site-visit" && OPEN_STEPS.indexOf(lead.status) >= 0 && OPEN_STEPS.indexOf(lead.status) < OPEN_STEPS.indexOf("site-visit")) {
      await trx("leads").where({ id: lead.id }).update({ status: "site-visit", updatedAt: new Date(), updatedBy: ctx.user.id })
      await systemNote(trx, ctx, lead.id, "Status → Site visit scheduled")
    }
  })
  return { ok: true }
}

// A planned item: done (with an outcome), moved to another time, or missed (no-show)
export async function updatePlannedActivity(code, activityId, { action, outcome = "", notes = "", next = "", nextType = "", nextTime = "" } = {}, form = null) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  const a = await live(ctx.db, "leadActivities")
    .where({ id: Number(activityId), leadId: lead.id, status: "planned" })
    .first()
  if (!a) return { error: "It was already done or removed." }
  const now = new Date()
  if (action === "done") {
    const voice = await readVoice(form)
    if (voice.error) return { error: voice.error }
    return record(ctx, lead, { type: a.type, outcome, notes, next, nextType, nextTime: /^\d{2}:\d{2}$/.test(nextTime) ? nextTime : "", projectCode: "" }, a.id, voice.file)
  }
  if (action === "reschedule") {
    const days = next ? followUpDays((await getLookups(ctx.db, ["follow-up"]))["follow-up"], next) : null
    if (days === null) return { error: "Pick when." }
    await ctx
      .db("leadActivities")
      .where({ id: a.id })
      .update({ at: followUpAt(days, now), updatedAt: now, updatedBy: ctx.user.id })
    return { ok: true }
  }
  if (action === "missed") {
    await ctx
      .db("leadActivities")
      .where({ id: a.id })
      .update({ status: "missed", doneAt: now, notes: [a.notes, notes].filter(Boolean).join(" · ") || null, updatedAt: now, updatedBy: ctx.user.id })
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
  const [lead, emailReady] = await Promise.all([getLead(ctx, code), smtpReady(ctx.db)])
  // emailReady: the workspace has its own email set up (Settings › Email), so leads can be emailed
  return lead ? { lead, emailReady } : { error: "That lead was removed or isn't yours to see." }
}

const emailSchema = z.object({
  subject: z.string().trim().min(2, "Add a subject.").max(200),
  message: z.string().trim().min(2, "Write a message.").max(10000),
})

// Email a lead from the workspace's own address (Settings › Email), then add it to the timeline
// like a call → { ok } | { error } | { fieldErrors }
export async function sendLeadEmail(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  if (!lead.email) return { error: "This lead has no email address. Add one with Edit details." }
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const { subject, message } = parsed.data

  const sent = await sendWorkspaceMail(ctx.db, { to: lead.email, subject, text: message })
  if (!sent.ok) return { error: sent.error }
  return record(ctx, lead, { type: "email", notes: `${subject}\n\n${message}`.slice(0, 2000) })
}

// Units that can be booked in a project (Close deal › Won): available ones, with their price
export async function loadBookableUnits(projectCode) {
  const { ctx, error } = await crmAction("view")
  if (error) return { error }
  const project = await live(ctx.db, "projects")
    .where({ code: String(projectCode ?? "").toUpperCase() })
    .first("id")
  if (!project) return { units: [] }
  const rows = await live(ctx.db, "units").where({ projectId: project.id, status: "available" }).orderBy("number").select("code", "number", "price", "type", "sizeValue", "sizeUnit")
  return { units: rows.map((u) => ({ code: u.code, number: u.number, price: Number(u.price), type: u.type, sizeValue: Number(u.sizeValue), sizeUnit: u.sizeUnit })) }
}

const bookingSchema = z.object({
  projectCode: z.string().trim().min(1, "Pick the project."),
  unitCode: z.string().trim().min(1, "Pick the unit."),
  kind: z.enum(["token", "booking"]),
  agreedPrice: z.coerce.number().positive("Enter the agreed price."),
  tokenAmount: z.coerce.number().min(0).optional().nullable(),
  // Token: when it's due. The payment plan after that is set up in Sales.
  tokenDueDate: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .optional()
    .default(""),
  notes: z.string().trim().max(2000).optional().default(""),
})

// Close a lead as won with a booking → { ok, booking } | { error } | { fieldErrors }
// The unit becomes Booked and the lead Booked. CRM records the deal up to the token (amount and
// when it's due); the payment plan after that is set up in the Sales app (schedule "pending").
export async function createBooking(code, input) {
  const { ctx, error } = await crmAction("edit")
  if (error) return { error }
  const lead = await leadByCode(ctx, code)
  if (!lead) return { error: "That lead was removed or isn't yours to see." }
  if (lead.archivedAt) return { error: "This lead is archived. Restore it to the pipeline first." }
  if (lead.status === "lost") return { error: "Reopen the lead before booking." }
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const project = await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id", "name")
  if (!project) return { fieldErrors: { projectCode: "Pick the project." } }
  const unit = await live(ctx.db, "units").where({ code: v.unitCode.toUpperCase(), projectId: project.id }).first("id", "code", "number", "status", "price")
  if (!unit) return { fieldErrors: { unitCode: "Pick a unit in this project." } }
  if (unit.status !== "available") return { fieldErrors: { unitCode: "That unit isn't available any more. Pick another." } }
  const token = v.kind === "token" ? Number(v.tokenAmount || 0) : 0
  if (token >= v.agreedPrice) return { fieldErrors: { tokenAmount: "The token has to be less than the agreed price." } }
  if (v.kind === "token" && !v.tokenDueDate) return { fieldErrors: { tokenDueDate: "Pick when the token is due." } }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())

  const lists = await getLookups(ctx.db, ["lead-status"])
  const label = (st) => lists["lead-status"].find((x) => x.value === st)?.label ?? st
  const now = new Date()
  let bookingCode
  await ctx.db
    .transaction(async (trx) => {
      // Still available inside the transaction (someone else may have booked it a moment ago)
      const fresh = await trx("units").where({ id: unit.id }).forUpdate().first("status")
      if (fresh?.status !== "available") throw new Error("UNIT_TAKEN")
      bookingCode = await nextCode(trx, "booking")
      const [bookingId] = await trx("bookings").insert({
        code: bookingCode,
        leadId: lead.id,
        unitId: unit.id,
        projectId: project.id,
        customerName: lead.name,
        customerPhone: lead.phone,
        kind: v.kind,
        // Sales takes it from here: a token starts at Token, a full booking at Booking & KYC
        stage: v.kind === "token" ? "token" : "booking-kyc",
        agreedPrice: v.agreedPrice,
        tokenAmount: v.kind === "token" ? token || null : null,
        tokenDueDate: v.kind === "token" ? v.tokenDueDate : null,
        schedule: "pending", // the Sales app sets the payment plan
        installments: 0,
        firstDueDate: v.kind === "token" ? v.tokenDueDate : today,
        status: "current",
        listPrice: unit.price,
        netPrice: v.agreedPrice,
        agentId: lead.assignedTo ?? ctx.user.id,
        soldBy: lead.assignedTo ?? ctx.user.id,
        // Sold by a dealer's login: the dealer earns the commission (rate saved on the booking)
        ...(await dealerTerms(trx, lead.assignedTo ?? ctx.user.id)),
        notes: v.notes || null,
        bookedAt: now,
        createdBy: ctx.user.id,
      })
      // The buyer becomes a customer on the lead's contact
      const contactId = await ensureContact(trx, lead, ctx.user.id)
      await linkContact(trx, contactId, { type: "booking", id: bookingId, role: "customer" }, ctx.user.id)
      await trx("bookings").where({ id: bookingId }).update({ contactId })
      await bookingEvent(
        trx,
        ctx,
        bookingId,
        "created",
        `Booked from lead ${lead.code}: ${project.name}, unit ${unit.number} at Rs ${new Intl.NumberFormat("en-PK").format(v.agreedPrice)}${token ? `; token Rs ${new Intl.NumberFormat("en-PK").format(token)} due ${v.tokenDueDate}` : ""}`,
      )
      // Only the token is due from CRM; Sales adds the rest of the plan
      if (token) await trx("bookingInstallments").insert({ bookingId, number: 0, kind: "token", label: "Token", dueDate: v.tokenDueDate, amount: token, status: "due", createdBy: ctx.user.id })
      await trx("units").where({ id: unit.id }).update({ status: "booked", holdBy: null, holdReason: null, holdExpiresAt: null, updatedAt: now, updatedBy: ctx.user.id })
      await trx("leads").where({ id: lead.id }).update({ status: "booked", lossReason: null, closedAt: now, projectId: project.id, updatedAt: now, updatedBy: ctx.user.id })
      // Planned follow-ups aren't needed once it's booked
      await trx("leadActivities").where({ leadId: lead.id, status: "planned" }).whereNull("deletedAt").update({ status: "missed", updatedAt: now, updatedBy: ctx.user.id })
      const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`
      const update = [`Booking ${bookingCode}: ${project.name}, unit ${unit.number} at ${rs(v.agreedPrice)}`, token ? `token ${rs(token)} due ${v.tokenDueDate}` : null].filter(Boolean).join(" · ")
      await systemNote(trx, ctx, lead.id, `Status: ${label(lead.status)} → ${label("booked")}\n\n${update}${v.notes ? `\n${v.notes}` : ""}`)
    })
    .catch((err) => {
      if (err.message === "UNIT_TAKEN") bookingCode = null
      else throw err
    })
  if (!bookingCode) return { fieldErrors: { unitCode: "That unit was just booked by someone else. Pick another." } }
  // Sales › Assignment rules for the stage it starts at
  const made = await ctx.db("bookings").where({ code: bookingCode }).first("id", "stage")
  if (made) await routeBooking(ctx, made.id, made.stage)
  await logToWorkspace(ctx.db, { type: "crm", action: "booking.created", actorUserId: ctx.user.id, summary: `booked unit ${unit.number} for ${lead.name} (${bookingCode})` })
  return { ok: true, booking: bookingCode }
}
