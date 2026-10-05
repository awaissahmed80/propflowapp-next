import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { platformDb, tenantDb } from "@/server/db/connections"
import { logActivity } from "@/server/tenants/activity"
import { normalizePhone } from "@/lib/phone"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { ensureContact, linkContact } from "@/modules/contacts/server/links"
import { nextInTurn, pickByRules } from "@/modules/crm/server/assignment"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { parseBudget } from "../constants"

// Lead forms: fields, settings and entries. Every entry becomes a CRM lead linked to its contact
// (by mobile), the form and its campaign (and the landing page it was filled on). Used on their
// own hosted page, embedded on a website (embed.js) or inside a landing page. Forms with a
// provider ("meta": a Facebook lead form linked in Campaigns › Integrations) aren't listed or
// public here; their entries come in through the provider.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// A new form starts with name, mobile and consent: the minimum for a callable lead
export const starterFields = () => [
  { id: "name", type: "name", label: "Full name", required: true, placeholder: "Your name" },
  { id: "phone", type: "phone", label: "Mobile (WhatsApp)", required: true, placeholder: "03xx xxxxxxx" },
  { id: "consent", type: "consent", label: "I agree to be contacted by phone and WhatsApp", required: true },
]
export const starterSettings = (name) => ({
  title: name,
  intro: "Leave your number and our team will call you.",
  submitLabel: "Send",
  successMessage: "Thank you! Our team will call you shortly.",
  whatsapp: "",
  redirectUrl: "",
  accent: "blue",
  channel: "facebook-ads",
  assignTo: "round-robin",
})

export function shapeForm(f) {
  return { code: f.code, name: f.name, status: f.status, fields: json(f.fields, starterFields()), settings: { ...starterSettings(f.name), ...json(f.settings, {}) }, views: Number(f.views ?? 0), createdAt: f.createdAt }
}

async function entryStats(db, formIds) {
  if (!formIds.length) return []
  return live(db, "leads").whereIn("formId", formIds).groupBy("formId").select("formId").count({ n: "id" }).max({ last: "createdAt" })
}

export async function listForms(ctx) {
  const forms = await live(ctx.db, "leadForms").whereNull("provider").orderBy("id", "desc")
  const [stats, campaigns, projects] = await Promise.all([
    entryStats(
      ctx.db,
      forms.map((f) => f.id),
    ),
    live(ctx.db, "campaigns").select("id", "code", "name"),
    live(ctx.db, "projects").select("id", "code", "name"),
  ])
  return forms.map((f) => {
    const s = stats.find((x) => x.formId === f.id)
    const entries = Number(s?.n ?? 0)
    const views = Number(f.views ?? 0)
    const campaign = campaigns.find((c) => c.id === f.campaignId)
    const project = projects.find((p) => p.id === f.projectId)
    return {
      ...shapeForm(f),
      campaign: campaign ? { code: campaign.code, name: campaign.name } : null,
      project: project ? { code: project.code, name: project.name } : null,
      entries,
      conversion: views ? entries / views : null,
      lastEntryAt: s?.last ?? null,
    }
  })
}

// One form with its entries (the leads this person can see in CRM)
export async function getForm(ctx, code) {
  const f = await live(ctx.db, "leadForms")
    .where({ code: String(code ?? "").toUpperCase() })
    .whereNull("provider")
    .first()
  if (!f) return null
  const [list] = (await listForms(ctx)).filter((x) => x.code === f.code)
  const leads = await live(ctx.db, "leads").where({ formId: f.id }).orderBy("createdAt", "desc").limit(500).select("id", "code", "name", "phone", "source", "status", "assignedTo", "createdAt")
  const crm = await crmContext()
  const visible = crm.can("view") ? new Set((await crmScoped(crm, live(ctx.db, "leads")).where({ formId: f.id }).select("id")).map((r) => r.id)) : new Set()
  const people = await peopleByIds(leads.map((l) => l.assignedTo))
  return {
    ...list,
    entriesList: leads.map((l) => ({
      code: visible.has(l.id) ? l.code : null,
      name: visible.has(l.id) ? l.name : "Lead with another agent",
      source: l.source,
      status: l.status,
      createdAt: l.createdAt,
      agent: people.get(l.assignedTo)?.name ?? null,
    })),
  }
}

export const formOptions = async (ctx) =>
  (await live(ctx.db, "leadForms").whereNull("provider").orderBy("name").select("code", "name", "status", "campaignId")).map((f) => ({ value: f.code, label: f.name, status: f.status }))

export async function createFormRow(trx, { name, campaignId, projectId, userId }) {
  const code = await nextCode(trx, "lead-form")
  await trx("leadForms").insert({ code, name, campaignId, projectId, status: "active", fields: JSON.stringify(starterFields()), settings: JSON.stringify(starterSettings(name)), views: 0, createdBy: userId })
  return code
}

// ---------- the public side (hosted form, embed, landing pages) ----------

// The workspace behind a public address → { tenant, db } | null (only workspaces in use)
export async function publicWorkspace(slug) {
  const tenant = await live(platformDb(), "tenants")
    .where({ slug: String(slug ?? "").toLowerCase() })
    .whereIn("status", ["trial", "active", "past_due"])
    .first("id", "slug", "name", "dbName", "dbHost")
  if (!tenant) return null
  return { tenant, db: tenantDb(tenant) }
}

export async function publicForm(db, code) {
  const f = await live(db, "leadForms")
    .where({ code: String(code ?? "").toUpperCase() })
    .whereNull("provider")
    .first()
  return f ? { ...shapeForm(f), id: f.id, campaignId: f.campaignId, projectId: f.projectId } : null
}

export const recordFormView = (db, formId) => db("leadForms").where({ id: formId }).increment("views", 1)

// Check an entry against the form's fields → { fieldId: message }
export function validateEntry(form, values) {
  const errors = {}
  for (const f of form.fields) {
    const v = values?.[f.id]
    const empty = v == null || v === "" || v === false
    if (f.required && empty) errors[f.id] = f.type === "consent" ? "Please agree to continue." : "Required"
    else if (f.type === "phone" && !empty && !normalizePhone(v)) errors[f.id] = "Enter a mobile number, e.g. 0300 1234567"
    else if (f.type === "email" && !empty && !/^\S+@\S+\.\S+$/.test(String(v))) errors[f.id] = "Enter a valid email"
    else if (typeof v === "string" && v.length > 2000) errors[f.id] = "That's too long."
  }
  return errors
}

// "10 Marla" → { value: 10, unit: "marla" }; "1,600 sq ft" → { value: 1600, unit: "sqft" }
function parseSize(label) {
  const m = String(label)
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*(marla|kanal|sq)/i)
  if (!m) return null
  return { value: Number(m[1]), unit: m[2].toLowerCase().startsWith("sq") ? "sqft" : m[2].toLowerCase() }
}

// Turn an entry into a CRM lead → { ok, duplicate, leadId, code } | { fieldErrors } | { error }
//   channel: from the link's utm_source when present (else the form's default channel)
//   pageId: the landing page it was filled on · test: from the form builder (by: who tested)
//   notes: lines to put first in the lead's notes · metaLeadId: the Facebook lead it came from
//   status: the new lead's status (default "new") · dedupeEmail: the same email also counts as the
//   same person (not only the same mobile)
export async function submitEntry({ db, tenant }, form, values, { channel = null, pageId = null, test = false, by = null, notes = [], metaLeadId = null, status = "new", dedupeEmail = false } = {}) {
  if (form.status !== "active" && !test) return { error: "This form isn't accepting entries right now." }
  const fieldErrors = validateEntry(form, values)
  if (Object.keys(fieldErrors).length) return { fieldErrors }
  const lists = await getLookups(db, ["unit-type", "lead-source", "city"])

  const lead = { name: "", phone: null, whatsapp: true, email: null, city: null, overseas: false, unitType: null, sizeValue: null, sizeUnit: null, budgetMin: null, budgetMax: null, paymentPlan: null }
  const extra = []
  for (const f of form.fields) {
    const v = values[f.id]
    if (v == null || v === "") continue
    if (f.type === "name") lead.name = String(v).trim().slice(0, 120)
    else if (f.type === "phone") lead.phone = normalizePhone(v)
    else if (f.type === "email") lead.email = String(v).trim().slice(0, 150)
    else if (f.type === "city") lead.city = String(v).slice(0, 80)
    else if (f.type === "consent" || f.mapTo === "skip") continue
    else if (f.mapTo === "overseas") lead.overseas = Boolean(v)
    else if (f.mapTo === "unitType") lead.unitType = lists["unit-type"].find((t) => t.label.toLowerCase() === String(v).toLowerCase() || t.value === String(v).toLowerCase())?.value ?? null
    else if (f.mapTo === "size") {
      const size = parseSize(v)
      if (size) Object.assign(lead, { sizeValue: size.value, sizeUnit: size.unit })
    } else if (f.mapTo === "budget") {
      const b = parseBudget(v)
      Object.assign(lead, { budgetMin: b.min, budgetMax: b.max })
    } else if (f.mapTo === "paymentPlan") lead.paymentPlan = /full|cash|lump/i.test(v) ? "cash" : "installments"
    else if (f.mapTo === "notes") extra.unshift(String(v).trim())
    else if (f.type !== "checkbox" || v) extra.push(`${f.label}: ${v === true ? "Yes" : v}`)
  }
  extra.unshift(...notes)
  if (test) extra.unshift("Test entry from the form builder.")
  if (!lead.phone) return { fieldErrors: { phone: "Enter a mobile number, e.g. 0300 1234567" } }
  if (!lead.name) lead.name = "Website enquiry"
  if (!lead.phone.startsWith("+92")) lead.overseas = true
  const source = [channel, form.settings.channel].find((s) => s && lists["lead-source"].some((x) => x.value === s)) ?? null

  // The same person with an open lead for the same project: a note on that lead instead
  const open = await live(db, "leads")
    .where((q) => (dedupeEmail && lead.email ? q.where({ phone: lead.phone }).orWhere({ email: lead.email }) : q.where({ phone: lead.phone })))
    .whereNotIn("status", ["booked", "lost"])
    .whereNull("archivedAt")
    .modify((q) => (form.projectId ? q.where({ projectId: form.projectId }) : q))
    .first("id", "code", "assignedTo")
  const now = new Date()
  if (open) {
    await db("leadActivities").insert({
      leadId: open.id,
      type: "system",
      status: "done",
      at: now,
      doneAt: now,
      by: by,
      notes: `Filled in “${form.name}” again${extra.length ? `\n${extra.join("\n")}` : ""}`,
      createdBy: by,
    })
    return { ok: true, duplicate: true, leadId: open.id, code: open.code, assignedTo: open.assignedTo ?? null }
  }

  // Who gets it: a set person, or the CRM assignment rules then the round-robin
  const ctx = { db, tenant: { id: tenant.id }, user: { id: by } }
  const row = { ...lead, source, projectId: form.projectId ?? null }
  const assignTo = form.settings.assignTo
  let assignedTo = null
  if (assignTo && assignTo !== "round-robin" && Number(assignTo)) assignedTo = Number(assignTo)
  else if (assignTo === "round-robin") assignedTo = (await pickByRules(ctx, row))?.userId ?? (await nextInTurn(ctx)) ?? null

  let code, leadId
  await db.transaction(async (trx) => {
    code = await nextCode(trx, "lead")
    const team = assignedTo ? ((await live(trx, "members").where({ userId: assignedTo }).first("teamId"))?.teamId ?? null) : null
    const [id] = await trx("leads").insert({
      ...row,
      code,
      status,
      priority: "warm",
      notes: extra.join("\n") || null,
      assignedTo,
      teamId: team,
      campaignId: form.campaignId ?? null,
      formId: form.id,
      landingPageId: pageId,
      metaLeadId,
      createdBy: by,
    })
    leadId = id
    await linkContact(trx, await ensureContact(trx, row, by), { type: "lead", id, role: "lead" }, by)
    // Fresh web leads go cold fast: a call within 15 minutes for whoever has it
    if (assignedTo) await trx("leadActivities").insert({ leadId: id, type: "call", status: "planned", at: new Date(now.getTime() + 15 * 60_000), by: assignedTo, notes: `New enquiry from “${form.name}”`, createdBy: by })
  })
  await logActivity(db, { type: "campaigns", action: "form.entry", actorUserId: by, summary: `${lead.name} filled in the form ${form.name} (${code})` })
  return { ok: true, duplicate: false, leadId, code, assignedTo }
}
