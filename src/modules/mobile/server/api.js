import "server-only"
import { NextResponse } from "next/server"
import { z } from "zod"
import { siteForHost } from "@/lib/sites"
import { mobileAccess } from "@/server/auth/mobile-session"
import { runAsMobile } from "@/server/auth/dal"

// Plumbing for the PropFlow mobile app API (src/app/api/mobile/v1, docs/mobile-api.md): JSON
// answers, the contract's error codes, request checks, rate limits and the token check. The same
// contract as School360's, so the apps share their client code.

const ERRORS = {
  invalid: [400, "The request isn't valid."],
  invalid_credentials: [401, "The email or password is wrong."],
  unauthorised: [401, "Sign in again."],
  no_access: [401, "You no longer have access to this workspace. Sign in again."],
  ticket_expired: [401, "This step has expired. Start again."],
  google_invalid: [401, "Google sign-in couldn't be checked. Try again."],
  google_not_linked: [404, "There's no PropFlow account with this Google email."],
  google_mismatch: [409, "This email is linked to a different Google account."],
  inactive: [403, "This account is switched off. Ask your administrator."],
  workspace_suspended: [403, "This workspace is suspended."],
  no_workspace: [403, "This account isn't part of a workspace."],
  password_change: [403, "Choose a new password first."],
  password_weak: [400, "Use at least {{minLength}} characters."],
  password_same: [400, "Choose a password you haven't used here."],
  locked: [423, "Too many wrong passwords. Try again later."],
  too_many: [429, "Too many tries. Wait a few minutes."],
  upgrade: [426, "Update the PropFlow app to carry on."],
  maintenance: [503, "PropFlow is under maintenance. Try again soon."],
  google_unavailable: [503, "Google sign-in isn't available."],
  forbidden: [403, "Your role can't do this here."],
  not_found: [404, "Not found."],
  feature_off: [403, "This isn't part of your workspace's plan."],
  op_conflict: [409, "This opId was used for something else."],
  duplicate: [409, "There's already an open lead with this mobile."],
  server: [500, "Something went wrong."],
}

const NO_STORE = { "Cache-Control": "private, no-store" }
export const json = (data, status = 200) => NextResponse.json(data, { status, headers: NO_STORE })

// { error: { code, message, field?, values? } } with the code's status; {{name}} in the message
// takes values.name
export function fail(code, { message, field, values } = {}) {
  const [status, text] = ERRORS[code] ?? [400, code]
  const words = (message ?? text).replace(/\{\{(\w+)\}\}/g, (m, k) => (values?.[k] != null ? String(values[k]) : m))
  return json({ error: { code, message: words, ...(field ? { field } : {}), ...(values ? { values } : {}) } }, status)
}

// A web action's { error } (a sentence) → the app's error, keeping the sentence; fieldErrors → invalid
export function failWith(result) {
  if (result?.fieldErrors) {
    const [field, message] = Object.entries(result.fieldErrors)[0] ?? []
    return fail("invalid", { field, message })
  }
  const text = String(result?.error ?? "")
  const code = /can't|isn't allowed|doesn't allow|ask an administrator/i.test(text) ? "forbidden" : /not found|no longer|isn't there/i.test(text) ? "not_found" : "invalid"
  return fail(code, { message: text || undefined })
}

// The minimum app version the API still talks to (MOBILE_MIN_VERSION, e.g. "1.2.0")
export const minAppVersion = () => process.env.MOBILE_MIN_VERSION || "0.0.0"
export const appVersionOf = (request) => /^\d+\.\d+\.\d+[\w.-]*$/.exec(request.headers.get("x-app-version") ?? "")?.[0]?.slice(0, 20) ?? null

// "1.2.10" < "1.10.0"; anything unparseable counts as up to date
export function olderThan(version, min) {
  const parts = (v) =>
    String(v ?? "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map(Number)
  const a = parts(version)
  const b = parts(min)
  if (!version || a.some(Number.isNaN) || b.some(Number.isNaN)) return false
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

// The mobile API answers on the auth host only (auth.<root>/api/mobile/v1)
export const onAuthHost = (request) => siteForHost(request.headers.get("host")) === "auth"

// ---------- request bodies ----------
export const emailField = z.string().trim().toLowerCase().max(190).pipe(z.email())
export const passwordField = z.string().min(1).max(256)
export const ticketField = z.string().min(20).max(4000)
export const deviceField = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(["ios", "android"]),
  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+[\w.-]*$/)
    .max(20),
  pushToken: z
    .string()
    .trim()
    .max(255)
    .regex(/^[\x21-\x7e]*$/)
    .optional()
    .nullable(),
})

// The JSON body checked against a zod object: { data } or { response } (400 invalid, naming the field)
export async function readBody(request, schema) {
  const raw = await request.json().catch(() => null)
  const parsed = schema.safeParse(raw ?? {})
  if (parsed.success) return { data: parsed.data }
  const issue = parsed.error.issues[0]
  return { response: fail("invalid", { field: issue?.path.join(".") || undefined, message: `Check ${issue?.path.join(".") || "the request"}.` }) }
}

// ?page=2&size=50 → { page, size } within limits
export function paging(url, { size: fallback = 25, max = 100 } = {}) {
  const sp = new URL(url).searchParams
  return { page: Math.max(1, Number(sp.get("page")) || 1), size: Math.min(max, Math.max(1, Number(sp.get("size")) || fallback)) }
}

// ?status=new,contacted → ["new", "contacted"]
export const listParam = (sp, key) =>
  (sp.get(key) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50)

// An app's context (crmContext, estateContext…) the phone may use: the workspace has the app and
// the role may open it; otherwise the answer to send
export const appClosed = (ctx) => (ctx.can("view") ? null : fail("forbidden", { message: "Your role can't open this app here." }))

// ---------- rate limits ----------
// Counted in memory (one pm2 instance): attempts per key in a sliding window (a restart clears them).
const hits = new Map()
export function tooMany(key, limit, windowMs = 15 * 60_000) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  // Refused tries aren't counted: pressing "Try again" while blocked doesn't push the wait back
  const over = recent.length >= limit
  if (!over) recent.push(now)
  hits.delete(key)
  hits.set(key, recent)
  if (hits.size > 20_000) hits.delete(hits.keys().next().value)
  return over
}

// Sign-in attempts (password and Google): per address and email, and per address overall (an
// office may share one address, so that one is generous)
export const signInLimited = (ip, email) => tooMany(`m:ip:${ip ?? "-"}`, 200) || (email ? tooMany(`m:e:${ip ?? "-"}:${email}`, 10) : false)
// The steps after (chooser, new password): per address
export const stepLimited = (ip) => tooMany(`m:step:${ip ?? "-"}`, 100)

// A public route (sign-in steps): host and version checks, JSON errors, never throws
export function publicRoute(handler) {
  return async (request, props) => {
    if (!onAuthHost(request)) return fail("not_found")
    if (olderThan(appVersionOf(request), minAppVersion())) return fail("upgrade")
    try {
      return await handler(request, (await props?.params) ?? {})
    } catch (err) {
      console.error("Mobile API failed:", err)
      // Outside production the reason helps whoever is building the app
      return fail("server", process.env.APP_ENV === "production" ? {} : { message: String(err?.message ?? err).slice(0, 300) })
    }
  }
}

// A route for a signed-in phone: the Bearer token (mobileAccess), then handler(request, access, params).
// The handler runs as that session (dal.js runAsMobile), so the portal's own contexts and actions
// (crmContext, createLead…) work for it with the same permission checks as in a browser.
const DENY = { unauthorised: "unauthorised", password: "password_change", suspended: "workspace_suspended", no_access: "no_access" }
export function mobileRoute(handler) {
  return publicRoute(async (request, params) => {
    const access = await mobileAccess(request, { appVersion: appVersionOf(request) })
    if (access.deny) return fail(DENY[access.deny] ?? "unauthorised")
    return runAsMobile(access, () => handler(request, access, params))
  })
}
