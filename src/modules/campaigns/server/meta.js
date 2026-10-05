import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { platformDb, tenantDb } from "@/server/db/connections"
import { openSecret } from "@/server/secret-box"
import { logActivity } from "@/server/tenants/activity"
import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { notify } from "@/server/notifications"
import { urlCode } from "@/lib/url"
import { META_SETTINGS_KEY, SYNC_MINUTES, mergeMetaSettings } from "../meta/settings"
import { MetaError, fetchLead, formLeads, leadForm, unsubscribePage } from "../meta/graph"
import { shapeForm, submitEntry } from "./forms"

// Facebook & Instagram lead ads, the workspace side. Each Facebook lead form is linked to a
// PropFlow lead form (provider "meta"), so its leads take the website forms' road: contact by
// mobile, the same person's open lead gets a note instead, CRM assignment rules, a call within
// 15 minutes. Every lead Meta sends is logged in meta_leads first (unique leadgen id), so a lead
// is never created twice and a failed one can be tried again.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// ---------- Facebook questions → form fields ----------

// What a custom question can fill on the lead (the connect dialog lets people change it)
export const MAP_TARGETS = [
  { value: "", label: "Add to notes" },
  { value: "notes", label: "Notes (first line)" },
  { value: "budget", label: "Budget" },
  { value: "size", label: "Size (marla, kanal, sq ft)" },
  { value: "unitType", label: "Property type" },
  { value: "paymentPlan", label: "Payment plan" },
  { value: "skip", label: "Don't keep" },
]

const STANDARD = { FULL_NAME: "name", PHONE: "phone", EMAIL: "email", CITY: "city" }
const SKIPPED = ["FIRST_NAME", "LAST_NAME"] // joined into the name

// A sensible guess from the question's wording
export function guessTarget(label) {
  const l = String(label ?? "").toLowerCase()
  if (/budget|price|amount|lakh|crore|lac\b|pkr|rs\.?\s/.test(l)) return "budget"
  if (/marla|kanal|size|sq\.?\s?ft|square/.test(l)) return "size"
  if (/installment|instalment|payment plan|cash|down ?payment/.test(l)) return "paymentPlan"
  if (/plot|house|apartment|flat|shop|commercial|residential|property type|unit type|looking for/.test(l)) return "unitType"
  if (/message|comment|question|anything else|remarks/.test(l)) return "notes"
  return ""
}

// Facebook questions → PropFlow form fields (none required: Meta already checked them)
//   mapping: { questionKey: target } chosen in the connect dialog
export function questionsToFields(questions = [], mapping = {}) {
  // The name always arrives as "__name": the full name, or first and last name joined
  const fields = [{ id: "__name", type: "name", label: "Name", required: false }]
  for (const q of questions) {
    if (SKIPPED.includes(q.type) || q.type === "FULL_NAME") continue
    const type = STANDARD[q.type]
    if (type) fields.push({ id: q.key, type, label: q.label, required: false })
    else fields.push({ id: q.key, type: "text", label: q.label, required: false, mapTo: mapping[q.key] ?? guessTarget(q.label) })
  }
  if (!fields.some((f) => f.type === "phone")) fields.push({ id: "phone_number", type: "phone", label: "Phone number", required: false })
  return fields
}

// Meta's field_data → { questionKey: answer } for submitEntry
function answers(fieldData, questions = []) {
  const values = Object.fromEntries(fieldData.map((f) => [f.name, f.values?.length > 1 ? f.values.join(", ") : (f.values?.[0] ?? "")]))
  const byType = (type) => questions.find((q) => q.type === type)?.key
  const first = values[byType("FIRST_NAME") ?? "first_name"]
  const last = values[byType("LAST_NAME") ?? "last_name"]
  values.__name = values[byType("FULL_NAME") ?? "full_name"] || [first, last].filter(Boolean).join(" ")
  // Answers to multiple-choice questions come as keys like "10_marla": make them readable
  for (const [k, v] of Object.entries(values)) if (typeof v === "string" && /^\S+_\S+$/.test(v) && !v.includes("@") && !k.includes("phone")) values[k] = v.replace(/_/g, " ")
  return values
}

// The workspace's lead settings (Configure › Lead settings)
export async function metaSettings(db) {
  const row = await db("settings").where({ key: META_SETTINGS_KEY }).first("value")
  return mergeMetaSettings(json(row?.value, null))
}

// ---------- workspaces and Pages ----------

// The workspace a Page's leads go to → { tenant, db } | null (only workspaces in use)
export async function siteForPage(pageId) {
  const route = await platformDb()("metaPages")
    .where({ pageId: String(pageId) })
    .first("tenantId")
  if (!route) return null
  const tenant = await live(platformDb(), "tenants").where({ id: route.tenantId }).whereIn("status", ["trial", "active", "past_due"]).first("id", "code", "name", "slug", "dbName", "dbHost")
  return tenant ? { tenant, db: tenantDb(tenant) } : null
}

export async function pageWithToken(db, pageId) {
  const page = await db("metaPages")
    .where({ pageId: String(pageId) })
    .first()
  if (!page) return null
  return { ...page, token: openSecret(page.pageToken) }
}

// A token Meta no longer accepts: the Page shows "Reconnect Facebook"
async function noteError(db, pageId, err) {
  const message = err instanceof MetaError && err.tokenExpired ? "Facebook access ended. Reconnect Facebook to keep receiving leads." : String(err?.message ?? err).slice(0, 300)
  await db("metaPages")
    .where({ pageId: String(pageId) })
    .update({ lastError: message, updatedAt: new Date() })
  return message
}

// ---------- linking forms ----------

// The PropFlow form behind a Facebook form, created with defaults if leads arrive before anyone
// set it up (new lead forms on a connected Page are picked up on their own) → { metaForm, form }
export async function ensureLinkedForm({ db }, page, formId, by = null) {
  let metaForm = await db("metaForms")
    .where({ formId: String(formId) })
    .first()
  if (!metaForm?.leadFormId) {
    const fb = await leadForm(formId, page.token)
    const { owner } = await metaSettings(db)
    await linkForm({ db }, page.pageId, fb, { campaignId: null, projectId: null, assignTo: owner, mapping: {} }, by)
    metaForm = await db("metaForms")
      .where({ formId: String(formId) })
      .first()
  }
  const row = await live(db, "leadForms").where({ id: metaForm.leadFormId }).first()
  return { metaForm, form: row ? { ...shapeForm(row), id: row.id, campaignId: row.campaignId, projectId: row.projectId } : null }
}

// Save (or create) the link between a Facebook form and its PropFlow form
//   fb: { id, name, status, questions } · settings: { campaignId, projectId, assignTo, mapping, paused }
export async function linkForm({ db }, pageId, fb, settings, by = null) {
  const fields = questionsToFields(fb.questions, settings.mapping)
  const formSettings = { title: fb.name, channel: "facebook-ads", assignTo: settings.assignTo ?? "round-robin" }
  await db.transaction(async (trx) => {
    const existing = await trx("metaForms")
      .where({ formId: String(fb.id) })
      .forUpdate()
      .first()
    let leadFormId = existing?.leadFormId ?? null
    const formRow = { name: fb.name.slice(0, 150), campaignId: settings.campaignId ?? null, projectId: settings.projectId ?? null, status: settings.paused ? "paused" : "active", fields: JSON.stringify(fields) }
    if (leadFormId) {
      const current = await trx("leadForms").where({ id: leadFormId }).first("settings")
      await trx("leadForms")
        .where({ id: leadFormId })
        .update({ ...formRow, settings: JSON.stringify({ ...json(current?.settings, {}), ...formSettings }), updatedAt: new Date(), updatedBy: by })
    } else {
      const code = await nextCode(trx, "lead-form")
      ;[leadFormId] = await trx("leadForms").insert({ ...formRow, code, provider: "meta", settings: JSON.stringify(formSettings), views: 0, createdBy: by })
    }
    const metaRow = { pageId: String(pageId), name: fb.name.slice(0, 200), fbStatus: fb.status ?? null, questions: JSON.stringify(fb.questions ?? []), leadFormId, updatedAt: new Date() }
    if (existing) await trx("metaForms").where({ id: existing.id }).update(metaRow)
    else await trx("metaForms").insert({ ...metaRow, formId: String(fb.id) })
  })
}

// ---------- receiving leads ----------

// One lead from Meta → { status, code? }. Safe to call again for the same lead.
//   lead: { id, pageId, formId, createdTime, platform, fieldData } (fieldData fetched when missing)
//   test: a made-up lead from the "Send test lead" button · held: a reason to keep it waiting
//   (paused) without adding it, e.g. PropFlow switched lead ads off for the workspace
export async function receiveLead(site, lead, { test = false, by = null, held = null } = {}) {
  const { db } = site
  const leadgenId = String(lead.id)
  await db("metaLeads")
    .insert({ leadgenId, pageId: lead.pageId ?? null, formId: lead.formId ?? null, isTest: test, createdTime: lead.createdTime ?? null })
    .onConflict("leadgenId")
    .ignore()
  const log = await db("metaLeads").where({ leadgenId }).first()
  if (["created", "duplicate"].includes(log.status)) return { status: log.status }
  const pageId = lead.pageId ?? log.pageId
  const done = (patch) =>
    db("metaLeads")
      .where({ id: log.id })
      .update({ ...patch, attempts: log.attempts + 1, processedAt: new Date() })
  if (held) {
    await done({ status: "paused", error: held })
    return { status: "paused", error: held }
  }

  try {
    const page = await pageWithToken(db, pageId)
    if (!page) throw new Error("This Facebook Page isn't connected any more.")
    let { fieldData, formId, platform, createdTime, isOrganic } = lead
    if (!fieldData) fieldData = json(log.fieldData, null)
    if (!fieldData) {
      const full = await fetchLead(leadgenId, page.token)
      fieldData = full.fieldData
      formId = formId ?? full.formId
      platform = platform ?? full.platform
      createdTime = createdTime ?? full.createdTime
      isOrganic = full.isOrganic
    }
    formId = formId ?? log.formId
    await db("metaLeads")
      .where({ id: log.id })
      .update({ fieldData: JSON.stringify(fieldData), formId, platform: platform ?? null, createdTime: createdTime ?? log.createdTime ?? null })

    const { metaForm, form } = await ensureLinkedForm(site, page, formId, by)
    if (!form) throw new Error("The PropFlow form for this Facebook form was deleted. Set the form up again.")
    if (form.status !== "active") {
      await done({ status: "paused", error: "The form is paused in PropFlow. Try again after turning it on." })
      return { status: "paused" }
    }
    const ig = platform === "ig"
    const settings = await metaSettings(db)
    const source = `${ig ? "Instagram" : "Facebook"} lead ad · “${metaForm.name}”${isOrganic ? " (organic)" : ""}`
    const notes = test ? ["Test lead from Campaigns › Integrations."] : settings.noteSource ? [source] : []
    const answered = answers(fieldData, json(metaForm.questions, []))
    const result = await submitEntry(site, form, answered, { channel: ig ? "instagram" : "facebook-ads", notes, metaLeadId: log.id, by, status: settings.stage, dedupeEmail: settings.dedupeEmail })
    if (!result.ok) {
      const error = result.fieldErrors ? "No mobile number in the lead, so it can't become a CRM lead." : (result.error ?? "Couldn't add the lead.")
      await done({ status: "failed", error })
      return { status: "failed", error }
    }
    await done({ status: result.duplicate ? "duplicate" : "created", leadId: result.leadId, error: null })
    await db("metaForms").where({ id: metaForm.id }).update({ lastLeadAt: new Date() })
    // The bell for whoever has the lead (or whoever connected Facebook, when nobody has it)
    if (settings.notify) {
      const to = result.assignedTo ?? (await db("metaConnections").orderBy("id", "desc").first("createdBy"))?.createdBy
      if (to)
        await notify(db, [to], {
          app: "crm",
          kind: "lead.meta",
          title: result.duplicate ? `${answered.__name || "A lead"} enquired again on ${ig ? "Instagram" : "Facebook"}` : `New ${ig ? "Instagram" : "Facebook"} lead: ${answered.__name || result.code}`,
          body: metaForm.name,
          href: `/crm/leads?lead=${urlCode(result.code)}`,
          icon: ig ? "instagram-line" : "facebook-circle-line",
          by,
        })
    }
    if (page.lastError) await db("metaPages").where({ id: page.id }).update({ lastError: null })
    return { status: result.duplicate ? "duplicate" : "created", code: result.code }
  } catch (err) {
    const error = err instanceof MetaError ? await noteError(db, pageId, err) : String(err?.message ?? err).slice(0, 300)
    console.error(`Meta lead ${leadgenId} failed:`, error)
    await done({ status: "failed", error })
    return { status: "failed", error }
  }
}

// A webhook delivery (already checked: signed by Meta) → leads received per workspace
export async function receiveWebhook(payload) {
  if (payload?.object !== "page") return 0
  let count = 0
  for (const entry of payload.entry ?? [])
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue
      const v = change.value
      try {
        const site = await siteForPage(v.page_id ?? entry.id)
        if (!site) continue // a Page no workspace receives leads from (any more)
        // Switched off by PropFlow: kept waiting in the log, added once it's back on
        const held = (await integrationOn(site.tenant.id, "meta")) ? null : INTEGRATION_OFF
        await receiveLead(site, { id: v.leadgen_id, pageId: String(v.page_id ?? entry.id), formId: v.form_id ? String(v.form_id) : null, createdTime: v.created_time ? new Date(v.created_time * 1000) : null }, { held })
        count += 1
      } catch (err) {
        console.error("Meta webhook lead failed:", err)
      }
    }
  return count
}

// Leads Meta has that PropFlow doesn't (webhook missed or failed): since the last check, or the
// last 90 days the first time → { found, created, duplicate, failed }
export async function syncForm(site, formId, by = null) {
  const metaForm = await site
    .db("metaForms")
    .where({ formId: String(formId) })
    .first()
  if (!metaForm) throw new Error("That form isn't connected.")
  const page = await pageWithToken(site.db, metaForm.pageId)
  if (!page) throw new Error("This Facebook Page isn't connected any more.")
  const started = new Date()
  const since = metaForm.syncedAt ? new Date(new Date(metaForm.syncedAt).getTime() - 3_600_000) : new Date(Date.now() - 90 * 86_400_000)
  let leads
  try {
    leads = await formLeads(formId, page.token, since)
  } catch (err) {
    throw new Error(err instanceof MetaError ? await noteError(site.db, page.pageId, err) : err.message)
  }
  const counts = { found: leads.length, created: 0, duplicate: 0, failed: 0 }
  for (const l of leads.reverse()) {
    const r = await receiveLead(site, { ...l, pageId: page.pageId, formId: String(formId) }, { by })
    if (r.status in counts) counts[r.status] += 1
  }
  await site.db("metaForms").where({ id: metaForm.id }).update({ syncedAt: started })
  if (counts.created)
    await logActivity(site.db, { type: "campaigns", action: "meta.synced", actorUserId: by, summary: `fetched ${counts.created} missed Facebook ${counts.created === 1 ? "lead" : "leads"} from “${metaForm.name}”` })
  return counts
}

// Try a failed or paused lead again (from its saved answers when Meta already sent them)
export async function retryLead(site, leadgenId, by = null) {
  const log = await site
    .db("metaLeads")
    .where({ leadgenId: String(leadgenId) })
    .first()
  if (!log) throw new Error("That lead isn't in the log.")
  if (!["failed", "paused", "received"].includes(log.status)) return { status: log.status }
  await site.db("metaLeads").where({ id: log.id }).update({ status: "received", error: null })
  return receiveLead(site, { id: log.leadgenId, pageId: log.pageId, formId: log.formId, platform: log.platform, createdTime: log.createdTime, fieldData: json(log.fieldData, null) }, { test: log.isTest, by })
}

// A made-up lead with sample answers, through the real road (no call to Meta)
export async function sendTestLead(site, formId, by) {
  const metaForm = await site
    .db("metaForms")
    .where({ formId: String(formId) })
    .first()
  if (!metaForm) throw new Error("That form isn't connected.")
  const questions = json(metaForm.questions, [])
  const sample = { FULL_NAME: "Test Lead (Facebook)", FIRST_NAME: "Test", LAST_NAME: "Lead", PHONE: `+92300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, EMAIL: "test.lead@example.com", CITY: "Lahore" }
  // Multiple-choice questions get their first choice, the rest a sample answer
  const fieldData = questions.map((q) => ({ name: q.key, values: [sample[q.type] ?? q.options?.[0] ?? "Sample answer"] }))
  if (!questions.some((q) => q.type === "PHONE")) fieldData.push({ name: "phone_number", values: [sample.PHONE] })
  if (!questions.some((q) => ["FULL_NAME", "FIRST_NAME"].includes(q.type))) fieldData.push({ name: "full_name", values: [sample.FULL_NAME] })
  return receiveLead(site, { id: `test-${Date.now()}`, pageId: metaForm.pageId, formId: metaForm.formId, platform: "fb", createdTime: new Date(), fieldData }, { test: true, by })
}

// Stop all lead ads and forget the Facebook connection (forms, their leads and the log stay).
// Used by the workspace and by PropFlow staff in the console.
export async function disconnectMetaFor(site) {
  const pages = await site.db("metaPages").whereNotNull("subscribedAt").select("pageId")
  for (const p of pages) {
    const page = await pageWithToken(site.db, p.pageId)
    if (page?.token) await unsubscribePage(page.pageId, page.token).catch((err) => console.error("Facebook unsubscribe failed:", err.message))
  }
  await platformDb()("metaPages").where({ tenantId: site.tenant.id }).delete()
  await site.db.transaction(async (trx) => {
    await trx("metaPages").delete()
    await trx("metaConnections").delete()
  })
  return pages.length
}

// The scheduled check (/api/cron/meta-sync): for each workspace receiving lead ads whose lead
// settings ask for a check that's due, fetch what the webhook missed → workspaces checked
export async function syncDueWorkspaces(now = new Date()) {
  const routes = await platformDb()("metaPages").distinct("tenantId")
  let checked = 0
  for (const { tenantId } of routes) {
    try {
      if (!(await integrationOn(tenantId, "meta"))) continue
      const tenant = await live(platformDb(), "tenants").where({ id: tenantId }).whereIn("status", ["trial", "active", "past_due"]).first("id", "code", "name", "dbName", "dbHost")
      if (!tenant) continue
      const site = { tenant, db: tenantDb(tenant) }
      const minutes = SYNC_MINUTES[(await metaSettings(site.db)).sync]
      if (!minutes) continue
      const forms = await site.db("metaForms as f").join("metaPages as p", "p.pageId", "f.pageId").whereNotNull("p.subscribedAt").whereNotNull("f.leadFormId").select("f.formId", "f.syncedAt")
      const due = forms.filter((f) => !f.syncedAt || now - new Date(f.syncedAt) >= minutes * 60_000)
      for (const f of due) await syncForm(site, f.formId).catch((err) => console.error(`Meta sync ${tenant.code} ${f.formId}:`, err.message))
      if (due.length) checked += 1
    } catch (err) {
      console.error("Meta scheduled sync:", err.message)
    }
  }
  return checked
}
