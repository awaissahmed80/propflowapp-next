import "server-only"
import crypto from "node:crypto"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { platformDb, tenantDb } from "@/server/db/connections"
import { notify } from "@/server/notifications"
import { urlCode } from "@/lib/url"
import { siteUrl } from "@/lib/sites"
import { shapeForm, submitEntry } from "@/modules/campaigns/server/forms"
import { answers, questionsToFields } from "@/modules/campaigns/server/meta"
import { mergeMetaSettings } from "@/modules/campaigns/meta/settings"
import { LEAD_SOURCES } from "./sources"

// Lead sources that post to PropFlow: Google Ads lead forms (Google's webhook) and Google Forms (an
// Apps Script). Each source has a key per workspace (in its settings) that every post must carry.
// Their forms are linked to PropFlow lead forms (provider = the source) and every lead is logged in
// external_leads first, then goes through submitEntry like website and Facebook leads.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// ---------- settings: the key and lead settings of one source ----------

// { key, owner, stage, notify, dedupeEmail, noteSource }
export async function sourceSettings(db, source) {
  const row = await db("settings").where({ key: LEAD_SOURCES[source].settingsKey }).first("value")
  const v = json(row?.value, null)
  return v ? { ...mergeMetaSettings(v), key: v.key ?? null } : null
}

export async function writeSourceSettings(db, source, value, by = null) {
  const key = LEAD_SOURCES[source].settingsKey
  const row = { key, value: JSON.stringify(value), updatedAt: new Date(), updatedBy: by }
  await db("settings").insert(row).onConflict("key").merge(["value", "updatedAt", "updatedBy"])
}

export const newSourceKey = () => crypto.randomBytes(24).toString("base64url")
export const sourceUrl = (tenant, source) => siteUrl("portal", `/api/leads/${source}/${String(tenant.code).toLowerCase()}`)

export const sameKey = (a, b) => {
  const x = Buffer.from(String(a ?? ""))
  const y = Buffer.from(String(b ?? ""))
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y)
}

// The workspace behind /api/leads/<source>/<code> → { tenant, db } | null (only workspaces in use)
export async function siteByCode(code) {
  const tenant = await live(platformDb(), "tenants")
    .where({ code: String(code ?? "").toUpperCase() })
    .whereIn("status", ["trial", "active", "past_due"])
    .first("id", "code", "name", "slug", "dbName", "dbHost")
  return tenant ? { tenant, db: tenantDb(tenant) } : null
}

// ---------- what each source posts → one shape ----------
//   { id, formId, formName, questions: [{ key, label, type }], fieldData: [{ name, values }], meta, isTest }

const GOOGLE_TYPES = { PHONE_NUMBER: "PHONE", WORK_PHONE: "PHONE", FULL_NAME: "FULL_NAME", FIRST_NAME: "FIRST_NAME", LAST_NAME: "LAST_NAME", EMAIL: "EMAIL", WORK_EMAIL: "EMAIL", CITY: "CITY" }

// Google Ads lead form webhook: { lead_id, form_id, campaign_id, adgroup_id, creative_id, gcl_id,
// google_key, is_test, user_column_data: [{ column_id, column_name, string_value }] }
export function fromGoogleAds(p) {
  const cols = Array.isArray(p?.user_column_data) ? p.user_column_data : []
  return {
    id: String(p?.lead_id ?? ""),
    formId: String(p?.form_id ?? "unknown"),
    formName: `Google Ads form ${p?.form_id ?? ""}`.trim(),
    questions: cols.map((c) => ({
      key: String(c.column_id ?? c.column_name),
      label:
        c.column_name ||
        String(c.column_id ?? "")
          .replace(/_/g, " ")
          .toLowerCase(),
      type: GOOGLE_TYPES[c.column_id] ?? "CUSTOM",
    })),
    fieldData: cols.map((c) => ({ name: String(c.column_id ?? c.column_name), values: [String(c.string_value ?? "")] })),
    meta: { campaignId: p?.campaign_id ?? null, adGroupId: p?.adgroup_id ?? null, creativeId: p?.creative_id ?? null, gclid: p?.gcl_id ?? null },
    isTest: Boolean(p?.is_test),
  }
}

// What a Google Forms question asks for, from its wording
function formsType(title) {
  const t = String(title ?? "").toLowerCase()
  if (/first name/.test(t)) return "FIRST_NAME"
  if (/last name|surname/.test(t)) return "LAST_NAME"
  if (/\bname\b|naam/.test(t)) return "FULL_NAME"
  if (/phone|mobile|whats ?app|cell|contact (no|number)/.test(t)) return "PHONE"
  if (/e-?mail/.test(t)) return "EMAIL"
  if (/\bcity\b|shehar/.test(t)) return "CITY"
  return "CUSTOM"
}
const slug = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "question"

// The Apps Script post: { key, formId, formTitle, responseId, email, answers: [{ title, type, value }], test }
export function fromGoogleForms(p) {
  const list = Array.isArray(p?.answers) ? p.answers : []
  const keys = new Map()
  const keyOf = (title) => {
    let k = slug(title)
    while (keys.has(k) && keys.get(k) !== title) k += "_"
    keys.set(k, title)
    return k
  }
  const questions = list.map((a) => ({ key: keyOf(a.title), label: String(a.title ?? "Question").slice(0, 200), type: formsType(a.title) }))
  const fieldData = list.map((a, i) => ({ name: questions[i].key, values: [String(a.value ?? "")] }))
  // A form that collects respondents' emails: that's the email, unless a question asked for it
  if (p?.email && !questions.some((q) => q.type === "EMAIL")) fieldData.push({ name: "email", values: [String(p.email)] })
  return { id: String(p?.responseId ?? ""), formId: String(p?.formId ?? "unknown"), formName: String(p?.formTitle || "Google Form").slice(0, 200), questions, fieldData, meta: null, isTest: Boolean(p?.test) }
}

// ---------- forms ----------

// Link a source's form to a PropFlow lead form (created on first sight with the lead settings'
// defaults, then kept in step with its questions) → the external_forms row
//   settings: { name, campaignId, projectId, assignTo, mapping, paused, channel }
export async function linkExternalForm({ db }, source, ext, settings, by = null) {
  const src = LEAD_SOURCES[source]
  await db.transaction(async (trx) => {
    const existing = await trx("externalForms").where({ source, externalId: ext.formId }).forUpdate().first()
    const name = (settings.name ?? existing?.name ?? ext.formName).slice(0, 150)
    const questions = ext.questions?.length ? ext.questions : json(existing?.questions, [])
    const formRow = {
      name,
      campaignId: settings.campaignId ?? null,
      projectId: settings.projectId ?? null,
      status: settings.paused ? "paused" : "active",
      fields: JSON.stringify(questionsToFields(questions, settings.mapping ?? {})),
    }
    const formSettings = { title: name, channel: settings.channel ?? src.channel, assignTo: settings.assignTo ?? "round-robin" }
    let leadFormId = existing?.leadFormId ?? null
    if (leadFormId) {
      const current = await trx("leadForms").where({ id: leadFormId }).first("settings")
      await trx("leadForms")
        .where({ id: leadFormId })
        .update({ ...formRow, settings: JSON.stringify({ ...json(current?.settings, {}), ...formSettings }), updatedAt: new Date(), updatedBy: by })
    } else {
      const code = await nextCode(trx, "lead-form")
      ;[leadFormId] = await trx("leadForms").insert({ ...formRow, code, provider: source, settings: JSON.stringify(formSettings), views: 0, createdBy: by })
    }
    const row = { name, questions: JSON.stringify(questions), leadFormId, updatedAt: new Date() }
    if (existing) await trx("externalForms").where({ id: existing.id }).update(row)
    else await trx("externalForms").insert({ ...row, source, externalId: ext.formId })
  })
  return db("externalForms").where({ source, externalId: ext.formId }).first()
}

// The form's current link settings (to keep them when its questions change)
async function linkedSettings(db, extForm) {
  if (!extForm?.leadFormId) return null
  const lf = await db("leadForms").where({ id: extForm.leadFormId }).first("campaignId", "projectId", "status", "settings", "fields")
  if (!lf) return null
  const s = json(lf.settings, {})
  const mapping = Object.fromEntries(
    json(lf.fields, [])
      .filter((f) => f.mapTo != null)
      .map((f) => [f.id, f.mapTo]),
  )
  return { campaignId: lf.campaignId, projectId: lf.projectId, paused: lf.status === "paused", assignTo: s.assignTo, channel: s.channel ?? null, mapping }
}

// Make sure the source's form is linked (new questions picked up) → { extForm, form }
async function ensureLinked(site, source, ext, defaults, by) {
  const known = await site.db("externalForms").where({ source, externalId: ext.formId }).first()
  const current = await linkedSettings(site.db, known)
  const questionsChanged = ext.questions?.length && JSON.stringify(json(known?.questions, [])) !== JSON.stringify(ext.questions)
  const extForm = !known?.leadFormId || questionsChanged ? await linkExternalForm(site, source, ext, current ?? { assignTo: defaults.owner, mapping: {} }, by) : known
  const row = await live(site.db, "leadForms").where({ id: extForm.leadFormId }).first()
  return { extForm, form: row ? { ...shapeForm(row), id: row.id, campaignId: row.campaignId, projectId: row.projectId } : null }
}

// ---------- receiving ----------

// One lead → { status, code?, error? }. Safe to repeat for the same lead.
//   held: keep it waiting (paused) with this reason · register: only note the form (install ping)
export async function receiveExternal(site, source, ext, { by = null, held = null, register = false } = {}) {
  const { db } = site
  const src = LEAD_SOURCES[source]
  const settings = (await sourceSettings(db, source)) ?? mergeMetaSettings(null)
  if (register) {
    await ensureLinked(site, source, ext, settings, by)
    return { status: "registered" }
  }
  if (!ext.id) return { status: "failed", error: "The post had no lead id." }
  await db("externalLeads")
    .insert({ source, externalId: ext.id, formExternalId: ext.formId, isTest: ext.isTest, fieldData: JSON.stringify(ext.fieldData), meta: ext.meta ? JSON.stringify(ext.meta) : null })
    .onConflict(["source", "externalId"])
    .ignore()
  const log = await db("externalLeads").where({ source, externalId: ext.id }).first()
  if (["created", "duplicate"].includes(log.status)) return { status: log.status }
  const done = (patch) =>
    db("externalLeads")
      .where({ id: log.id })
      .update({ ...patch, attempts: log.attempts + 1, processedAt: new Date() })
  if (held) {
    await done({ status: "paused", error: held })
    return { status: "paused", error: held }
  }
  try {
    const { extForm, form } = await ensureLinked(site, source, ext, settings, by)
    if (!form) throw new Error("The PropFlow form for this form was deleted. Set the form up again.")
    if (form.status !== "active") {
      await done({ status: "paused", error: "The form is paused in PropFlow. Try again after turning it on." })
      return { status: "paused" }
    }
    const questions = json(extForm.questions, [])
    const values = answers(ext.fieldData, questions)
    const notes = ext.isTest ? [`Test lead from ${src.short}.`] : settings.noteSource ? [`${src.short} · “${extForm.name}”`] : []
    const channel = src.channel ?? form.settings.channel ?? null
    const result = await submitEntry(site, form, values, { channel, notes, by, status: settings.stage, dedupeEmail: settings.dedupeEmail })
    if (!result.ok) {
      const error = result.fieldErrors ? "No mobile number in the lead, so it can't become a CRM lead." : (result.error ?? "Couldn't add the lead.")
      await done({ status: "failed", error })
      return { status: "failed", error }
    }
    await done({ status: result.duplicate ? "duplicate" : "created", leadId: result.leadId, error: null })
    await db("externalForms").where({ id: extForm.id }).update({ lastLeadAt: new Date() })
    if (settings.notify && result.assignedTo)
      await notify(db, [result.assignedTo], {
        app: "crm",
        kind: `lead.${source}`,
        title: result.duplicate ? `${values.__name || "A lead"} enquired again (${src.short})` : `New ${src.short} lead: ${values.__name || result.code}`,
        body: extForm.name,
        href: `/crm/leads?lead=${urlCode(result.code)}`,
        icon: source === "google-ads" ? "google-line" : "survey-line",
        by,
      })
    return { status: result.duplicate ? "duplicate" : "created", code: result.code }
  } catch (err) {
    const error = String(err?.message ?? err).slice(0, 300)
    console.error(`${src.short} lead ${ext.id} failed:`, error)
    await done({ status: "failed", error })
    return { status: "failed", error }
  }
}

// Try a failed or paused lead again from its saved answers
export async function retryExternal(site, source, id, by = null) {
  const log = await site.db("externalLeads").where({ source, id }).first()
  if (!log) throw new Error("That lead isn't in the log.")
  if (!["failed", "paused", "received"].includes(log.status)) return { status: log.status }
  const extForm = await site.db("externalForms").where({ source, externalId: log.formExternalId }).first()
  await site.db("externalLeads").where({ id: log.id }).update({ status: "received", error: null })
  return receiveExternal(
    site,
    source,
    {
      id: log.externalId,
      formId: log.formExternalId,
      formName: extForm?.name ?? "Form",
      questions: json(extForm?.questions, []),
      fieldData: json(log.fieldData, []),
      meta: json(log.meta, null),
      isTest: Boolean(log.isTest),
    },
    { by },
  )
}
