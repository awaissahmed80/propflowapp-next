import "server-only"
import crypto from "node:crypto"
import { platformDb } from "@/server/db/connections"

// Website analytics for the console, read from Google Analytics 4 with the Data API (free; see
// docs/deploy.md). A service account signs in with GA_CLIENT_EMAIL + GA_PRIVATE_KEY and needs
// Viewer access on the property GA_PROPERTY_ID. Only totals come back, never visitor details.
// Reports are cached for 30 minutes (realtime for 1), so opening the page often costs nothing.

const API = "https://analyticsdata.googleapis.com/v1beta"
const REPORT_MS = 30 * 60_000
const REALTIME_MS = 60_000
export const RANGES = [7, 28, 90]
const cache = (globalThis.__pfAnalytics ??= { token: null, reports: new Map(), realtime: null })

export function analyticsConfig() {
  const propertyId = process.env.GA_PROPERTY_ID?.replace(/\D/g, "")
  const email = process.env.GA_CLIENT_EMAIL?.trim()
  const key = pemKey(process.env.GA_PRIVATE_KEY)
  return propertyId && email && key ? { propertyId, email, key } : null
}

// The key as pasted from the JSON file: real line breaks, "\n" escapes, or all on one line
function pemKey(raw) {
  if (!raw) return null
  const text = raw.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n")
  const body = text.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")
  if (!body) return null
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`
}

// OAuth access token for the service account (JWT bearer grant), reused until shortly before it expires
async function accessToken({ email, key }) {
  if (cache.token && cache.token.expires > Date.now() + 60_000) return cache.token.value
  const now = Math.floor(Date.now() / 1000)
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url")
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: email, scope: "https://www.googleapis.com/auth/analytics.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key, "base64url")
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AnalyticsError("signin", data.error_description || data.error || `Google sign-in failed (${res.status})`)
  cache.token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return cache.token.value
}

class AnalyticsError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

async function call(config, path, body) {
  const token = await accessToken(config)
  const res = await fetch(`${API}/properties/${config.propertyId}:${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return data
  const message = data.error?.message ?? `Google Analytics answered ${res.status}`
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) throw new AnalyticsError("api", message)
  if (res.status === 403) throw new AnalyticsError("access", message)
  if (res.status === 429) throw new AnalyticsError("quota", message)
  throw new AnalyticsError("other", message)
}

// One GA response → [{ dims: [..], values: [numbers] }]
const rowsOf = (report) => (report?.rows ?? []).map((r) => ({ dims: r.dimensionValues?.map((d) => d.value) ?? [], values: r.metricValues.map((m) => Number(m.value) || 0) }))

const eventIn = (names) => ({ filter: { fieldName: "eventName", inListFilter: { values: names } } })

const TOTALS = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration"]

async function fetchReports(config, days) {
  const current = { startDate: `${days - 1}daysAgo`, endDate: "today", name: "current" }
  const previous = { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo`, name: "previous" }
  const [main, more] = await Promise.all([
    call(config, "batchRunReports", {
      requests: [
        { dateRanges: [current, previous], metrics: TOTALS.map((name) => ({ name })) },
        { dateRanges: [current], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 100 },
        { dateRanges: [current], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 8 },
        { dateRanges: [current], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 8 },
        {
          dateRanges: [current],
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
          dimensionFilter: eventIn(["create_workspace_click", "get_started_step", "generate_lead"]),
        },
      ],
    }),
    call(config, "batchRunReports", {
      requests: [
        { dateRanges: [current], dimensions: [{ name: "city" }, { name: "country" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 8 },
        { dateRanges: [current], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }] },
      ],
    }),
  ])
  const [totals, daily, sources, pages, events] = main.reports
  const [places, devices] = more.reports

  // Totals: one row per date range (GA adds a dateRange dimension when there are two)
  const byRange = Object.fromEntries(rowsOf(totals).map((r) => [r.dims.at(-1), Object.fromEntries(TOTALS.map((m, i) => [m, r.values[i]]))]))
  const empty = Object.fromEntries(TOTALS.map((m) => [m, 0]))

  // Every day of the range, including days with no visits
  const seen = Object.fromEntries(rowsOf(daily).map((r) => [r.dims[0], r.values]))
  const days_ = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000)
    const key = d.toISOString().slice(0, 10).replaceAll("-", "")
    const [visitors = 0, sessions = 0] = seen[key] ?? []
    return { day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" }), visitors, sessions }
  })

  const event = (name) => rowsOf(events).find((r) => r.dims[0] === name)?.values ?? [0, 0]
  return {
    totals: { current: byRange.current ?? empty, previous: byRange.previous ?? empty },
    daily: days_,
    sources: rowsOf(sources).map((r) => ({ label: r.dims[0], value: r.values[0] })),
    pages: rowsOf(pages).map((r) => ({ label: r.dims[0], value: r.values[0] })),
    places: rowsOf(places).map((r) => ({ label: r.dims[0] === "(not set)" ? r.dims[1] : `${r.dims[0]}, ${r.dims[1]}`, value: r.values[0] })),
    devices: rowsOf(devices).map((r) => ({ label: r.dims[0][0].toUpperCase() + r.dims[0].slice(1), value: r.values[0] })),
    funnel: { clicks: event("create_workspace_click")[1], started: event("get_started_step")[1], leads: event("generate_lead")[1] },
  }
}

// Get-started requests that actually reached Sales Enquiries, for the same days
async function savedRequests(days) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
  since.setHours(0, 0, 0, 0)
  const row = await platformDb()("enquiries").where("createdAt", ">=", since).count({ all: "*" }).first()
  return Number(row?.all ?? 0)
}

// Everything the Analytics page shows: { ok, data } or { ok: false, setup | error }
export async function getWebsiteAnalytics(days) {
  const config = analyticsConfig()
  if (!config) return { ok: false, setup: true }
  try {
    const hit = cache.reports.get(days)
    const fresh = hit && Date.now() - hit.at < REPORT_MS
    const [reports, realtime, requests] = await Promise.all([
      fresh ? hit.data : fetchReports(config, days).then((data) => (cache.reports.set(days, { at: Date.now(), data }), data)),
      cache.realtime && Date.now() - cache.realtime.at < REALTIME_MS
        ? cache.realtime.value
        : call(config, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] }).then((r) => {
            const value = rowsOf(r)[0]?.values[0] ?? 0
            cache.realtime = { at: Date.now(), value }
            return value
          }),
      savedRequests(days),
    ])
    return { ok: true, data: { ...reports, activeNow: realtime, requests, updatedAt: fresh ? hit.at : Date.now() } }
  } catch (err) {
    if (err instanceof AnalyticsError) return { ok: false, error: err.kind, message: err.message }
    throw err
  }
}
