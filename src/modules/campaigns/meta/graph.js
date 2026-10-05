import "server-only"
import crypto from "node:crypto"
import { siteUrl } from "@/lib/sites"

// Meta (Facebook) Graph API for lead ads. No SDK: plain HTTPS calls. Keys come from .env; with no
// app ID and secret the Facebook card asks the platform owner to set them up.
//   META_APP_ID, META_APP_SECRET · META_WEBHOOK_VERIFY_TOKEN (typed into the app's webhook setup)
//   META_GRAPH_VERSION (optional, e.g. v23.0) · META_SCOPES (optional) · META_REDIRECT_URI (optional: Facebook Login's
//   return address when the portal's own can't be used, e.g. http://localhost:5190/api/meta/callback)

const VERSION = () => process.env.META_GRAPH_VERSION?.trim() || "v23.0"
const GRAPH = () => `https://graph.facebook.com/${VERSION()}`

// What the workspace lets PropFlow do: list its Pages (also ones in a Business Manager), read
// lead forms and leads, and subscribe the Page to lead webhooks
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval", "business_management"]
// META_SCOPES in .env (comma-separated) replaces the list, e.g. while App Review is pending
const scopes = () =>
  process.env.META_SCOPES?.split(",")
    .map((x) => x.trim())
    .filter(Boolean) ?? META_SCOPES

// Short-lived signed cookie between "Connect Facebook" and Facebook's callback
export const META_COOKIE = "pf_meta"
// Where Facebook Login was started from, and returns to (?from=…)
export const META_RETURN = { campaigns: "/campaigns/integrations", settings: "/settings/integrations" }

export const metaEnabled = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
export const metaRedirectUri = () => process.env.META_REDIRECT_URI?.trim() || siteUrl("portal", "/api/meta/callback")

// A Graph error with Meta's code; 190 (or 102, 463, 467) means the token no longer works
export class MetaError extends Error {
  constructor(message, { code = null, subcode = null, status = null } = {}) {
    super(message)
    this.code = code
    this.subcode = subcode
    this.status = status
  }
  get tokenExpired() {
    return [190, 102].includes(this.code) || [463, 467].includes(this.subcode)
  }
}

async function call(path, { method = "GET", params = {}, token = null } = {}) {
  const url = new URL(path.startsWith("https://") ? path : `${GRAPH()}${path}`)
  const query = new URLSearchParams({ ...params, ...(token ? { access_token: token } : {}) })
  if (token) query.set("appsecret_proof", crypto.createHmac("sha256", process.env.META_APP_SECRET).update(token).digest("hex"))
  // A paging link from Meta already carries its own query (token included)
  if (method === "GET") for (const [k, v] of query) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method,
    ...(method === "GET" ? {} : { body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    const e = body.error ?? {}
    throw new MetaError(e.error_user_msg || e.message || `Facebook answered ${res.status}`, { code: e.code ?? null, subcode: e.error_subcode ?? null, status: res.status })
  }
  return body
}

// Every page of a list (Graph pages lists 25 at a time), up to `max` items
async function all(path, opts, max = 500) {
  const out = []
  let next = path
  let first = true
  while (next && out.length < max) {
    const body = first ? await call(next, opts) : await call(next)
    first = false
    out.push(...(body.data ?? []))
    next = body.paging?.next ?? null
  }
  return out.slice(0, max)
}

// ---------- Facebook Login ----------

export function metaLoginUrl(state) {
  const url = new URL(`https://www.facebook.com/${VERSION()}/dialog/oauth`)
  url.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: metaRedirectUri(), state, response_type: "code", scope: scopes().join(",") }).toString()
  return url.toString()
}

// The code from Facebook Login → { token, expiresAt } for a long-lived (≈60 day) user token
export async function exchangeCode(code) {
  const short = await call("/oauth/access_token", { params: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: metaRedirectUri(), code } })
  const long = await call("/oauth/access_token", { params: { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token } })
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null }
}

export const me = (token) => call("/me", { token, params: { fields: "id,name" } })

// Permissions the person actually granted (they can untick some in the dialog)
export async function grantedScopes(token) {
  const list = await all("/me/permissions", { token })
  return list.filter((p) => p.status === "granted").map((p) => p.permission)
}

// Pages the person manages, each with its own (non-expiring) Page token
export async function myPages(token) {
  const pages = await all("/me/accounts", { token, params: { fields: "id,name,access_token,tasks", limit: "100" } })
  return pages.map((p) => ({ id: p.id, name: p.name, token: p.access_token, tasks: p.tasks ?? [] }))
}

// ---------- Pages, forms and leads ----------

export const subscribePage = (pageId, pageToken) => call(`/${pageId}/subscribed_apps`, { method: "POST", token: pageToken, params: { subscribed_fields: "leadgen" } })
export const unsubscribePage = (pageId, pageToken) => call(`/${pageId}/subscribed_apps`, { method: "DELETE", token: pageToken })

const FORM_FIELDS = "id,name,status,created_time,questions{key,label,type,options}"
const shapeForm = (f) => ({
  id: f.id,
  name: f.name,
  status: f.status ?? null,
  createdTime: f.created_time ?? null,
  questions: (f.questions ?? []).map((q) => ({ key: q.key, label: q.label ?? q.key, type: q.type ?? "CUSTOM", options: (q.options ?? []).map((o) => o.value ?? o.key) })),
})

export async function pageForms(pageId, pageToken) {
  return (await all(`/${pageId}/leadgen_forms`, { token: pageToken, params: { fields: FORM_FIELDS, limit: "100" } })).map(shapeForm)
}
export const leadForm = async (formId, pageToken) => shapeForm(await call(`/${formId}`, { token: pageToken, params: { fields: FORM_FIELDS } }))

const LEAD_FIELDS = "id,created_time,field_data,form_id,ad_id,platform,is_organic"
const shapeLead = (l) => ({
  id: l.id,
  createdTime: l.created_time ? new Date(l.created_time) : null,
  formId: l.form_id ?? null,
  platform: l.platform ?? null,
  isOrganic: Boolean(l.is_organic),
  fieldData: (l.field_data ?? []).map((f) => ({ name: f.name, values: f.values ?? [] })),
})

export const fetchLead = async (leadgenId, pageToken) => shapeLead(await call(`/${leadgenId}`, { token: pageToken, params: { fields: LEAD_FIELDS } }))

// Leads of a form since a date (Meta keeps them 90 days)
export async function formLeads(formId, pageToken, since) {
  const params = { fields: LEAD_FIELDS, limit: "100" }
  if (since) params.filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) }])
  return (await all(`/${formId}/leads`, { token: pageToken, params }, 1000)).map(shapeLead)
}

// ---------- Webhooks ----------

// X-Hub-Signature-256: "sha256=<hex HMAC of the raw body with the app secret>"
export function validSignature(raw, header) {
  const secret = process.env.META_APP_SECRET
  if (!secret || !header?.startsWith("sha256=")) return false
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`)
  const got = Buffer.from(header)
  return expected.length === got.length && crypto.timingSafeEqual(expected, got)
}
