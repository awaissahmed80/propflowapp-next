import "server-only"
import crypto from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

// Push notifications to the PropFlow mobile app through Firebase Cloud Messaging (HTTP v1), with
// no Firebase SDK: a service account signs a JWT (RS256, node:crypto), Google swaps it for an OAuth
// access token (kept in memory until 5 minutes before it ends) and each message is one POST to
// <FCM_ENDPOINT>/v1/projects/<project>/messages:send. docs/mobile-api.md › Push notifications.
//
//   FCM_SERVICE_ACCOUNT  the service account's JSON key: a file path, or the JSON in base64.
//                        Not set: pushes are skipped (in-app notifications still work).
//   FCM_ENDPOINT         testing only: another FCM address (default https://fcm.googleapis.com)
//   FCM_TOKEN_URL        testing only: another OAuth token address (default the key's token_uri)
//
// sendPushes() never throws: failures are logged, and tokens FCM says are gone are reported back
// (dead) so the caller can forget them.

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const CONCURRENCY = 6
const TIMEOUT_MS = 10_000
const EARLY_MS = 5 * 60_000 // a new access token this long before the old one ends

const state = (globalThis.__pfFcm ??= { key: undefined, raw: undefined, token: null, tokenLoad: null, warned: false })

// The service account { projectId, clientEmail, privateKey, tokenUri } or null (not set up / unreadable)
export function fcmAccount() {
  const raw = (process.env.FCM_SERVICE_ACCOUNT ?? "").trim()
  if (raw === state.raw) return state.key
  state.raw = raw
  state.token = null
  state.key = null
  if (!raw) {
    if (!state.warned && process.env.NODE_ENV !== "production") console.debug("[push] FCM_SERVICE_ACCOUNT isn't set: push notifications are off.")
    state.warned = true
    return null
  }
  try {
    // The JSON itself, a file, or base64 of the JSON
    const text = raw.startsWith("{") ? raw : existsSync(raw) ? readFileSync(raw, "utf8") : Buffer.from(raw, "base64").toString("utf8")
    const json = JSON.parse(text)
    if (!json.project_id || !json.client_email || !json.private_key) throw new Error("project_id, client_email or private_key is missing")
    state.key = { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key, tokenUri: json.token_uri || GOOGLE_TOKEN_URL }
  } catch (err) {
    // Never the parse error's text: it can quote the key
    console.error("[push] FCM_SERVICE_ACCOUNT can't be read:", err instanceof SyntaxError ? "not valid JSON" : err.message)
  }
  return state.key
}

export const pushEnabled = () => Boolean(fcmAccount())

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url")

function signedJwt(key, aud) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ iss: key.clientEmail, scope: SCOPE, aud, iat: now, exp: now + 3600 })}`
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key.privateKey).toString("base64url")
  return `${unsigned}.${signature}`
}

// An OAuth access token, from memory while it has more than 5 minutes left; concurrent callers
// share one request
async function accessToken(key) {
  if (state.token && state.token.expires - EARLY_MS > Date.now()) return state.token.value
  state.tokenLoad ??= (async () => {
    try {
      const url = process.env.FCM_TOKEN_URL || key.tokenUri
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(key, url) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.access_token) throw new Error(`token ${res.status} ${json.error ?? ""}`.trim())
      state.token = { value: json.access_token, expires: Date.now() + (Number(json.expires_in) || 3600) * 1000 }
      return state.token.value
    } finally {
      state.tokenLoad = null
    }
  })()
  return state.tokenLoad
}

// FCM's answer → is the token gone for good (uninstalled app, expired or malformed token, other project)?
function deadToken(status, error) {
  const code = (error?.details ?? []).find((d) => d.errorCode)?.errorCode
  if (code === "UNREGISTERED" || code === "SENDER_ID_MISMATCH") return true
  if (status === 404 || error?.status === "NOT_FOUND") return true
  // 400 INVALID_ARGUMENT is also a bad payload: only a token FCM calls invalid counts
  return status === 400 && error?.status === "INVALID_ARGUMENT" && /registration token/i.test(error?.message ?? "")
}

// Logs never carry device tokens, keys or access tokens: long token-like runs are cut out
const redact = (text) => String(text ?? "").replace(/[A-Za-z0-9:_.\-]{60,}/g, "[…]")

// Send messages: [{ token, message }] where message is FCM's message minus the token. A few at a
// time. → { sent, failed, dead: [token], results: [{ ok, status, code, dead }] (in items' order) }
export async function sendPushes(items) {
  const out = { sent: 0, failed: 0, dead: [], results: (items ?? []).map(() => ({ ok: false, status: 0, code: "NOT_SENT", dead: false })) }
  const key = fcmAccount()
  if (!key || !items?.length) return out
  const url = `${(process.env.FCM_ENDPOINT || "https://fcm.googleapis.com").replace(/\/+$/, "")}/v1/projects/${encodeURIComponent(key.projectId)}/messages:send`
  let token
  try {
    token = await accessToken(key)
  } catch (err) {
    console.error("[push] FCM sign-in failed:", redact(err.message))
    out.failed = items.length
    return out
  }
  const sendOne = async ({ token: device, message }, n) => {
    const result = out.results[n]
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ message: { ...message, token: device } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      result.status = res.status
      if (res.ok) {
        await res.body?.cancel().catch(() => {})
        Object.assign(result, { ok: true, code: "OK" })
        out.sent++
        return
      }
      const error = (await res.json().catch(() => ({})))?.error
      out.failed++
      result.code = (error?.details ?? []).find((d) => d.errorCode)?.errorCode ?? error?.status ?? "ERROR"
      if (deadToken(res.status, error)) {
        result.dead = true
        out.dead.push(device)
      } else {
        // An access token Google no longer accepts: get a new one next time
        if (res.status === 401) state.token = null
        console.error(`[push] FCM ${res.status} ${result.code}: ${redact(error?.message)}`)
      }
    } catch (err) {
      out.failed++
      result.code = "NETWORK"
      console.error("[push] FCM send failed:", redact(err.message))
    }
  }
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const n = next++
        await sendOne(items[n], n)
      }
    }),
  )
  return out
}

// For scripts (e.g. a real send to a simulator's token): one message to these tokens →
// [{ ok, status, code, dead }] in the tokens' order (FCM's errorCode or status in code). Tokens
// aren't logged or cleared here.
export async function sendToTokens(tokens, message) {
  return (await sendPushes(tokens.map((token) => ({ token, message })))).results
}

// For scripts: can the service account get an OAuth access token? → { ok, expiresIn (seconds) }
// or { ok: false, error }. Sends nothing; the token itself is never returned.
export async function checkAccessToken() {
  const key = fcmAccount()
  if (!key) return { ok: false, error: "FCM_SERVICE_ACCOUNT isn't set or can't be read" }
  try {
    await accessToken(key)
    return { ok: true, expiresIn: Math.round((state.token.expires - Date.now()) / 1000) }
  } catch (err) {
    return { ok: false, error: redact(err.message) }
  }
}

// Testing: forget the cached key and access token
export function resetFcm() {
  Object.assign(state, { key: undefined, raw: undefined, token: null, tokenLoad: null, warned: false })
}
