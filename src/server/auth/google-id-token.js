import "server-only"
import crypto from "node:crypto"
import { platformDb } from "@/server/db/connections"
// Settings values come back as text or parsed JSON
const fromJson = (v) => (typeof v === "string" ? JSON.parse(v) : (v ?? null))

// "Sign in with Google" in the mobile app: the app signs in with Google itself
// (@react-native-google-signin, webClientId = GOOGLE_CLIENT_ID) and sends us the ID token. Unlike
// the web flow (google.js), the token reaches us through the phone, so its signature is checked
// against Google's published keys (RS256, node:crypto; no JWT library).
//
// Accepted audiences: GOOGLE_CLIENT_ID (the web client: with webClientId set, the token is issued
// for it) plus GOOGLE_IOS_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID when set. Those two may be comma
// lists: the main app's client first, then any branded build.

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
// Clock difference allowed between Google, the phone and us
const SKEW_S = 60
// Google's keys rotate every few weeks; its Cache-Control says how long to keep them (about 6 h)
const DEFAULT_TTL_MS = 3_600_000
// An unknown key id fetches again at most this often (a forged kid can't make us hammer Google)
const REFETCH_MS = 60_000

const isProduction = () => process.env.APP_ENV === "production"
const list = (v) => String(v ?? "").split(",").map((s) => s.trim())
export const googleAudiences = () => [process.env.GOOGLE_CLIENT_ID?.trim(), ...list(process.env.GOOGLE_IOS_CLIENT_ID), ...list(process.env.GOOGLE_ANDROID_CLIENT_ID)].filter(Boolean)
export const mobileGoogleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID)

let jwks = { keys: new Map(), until: 0, fetchedAt: 0 }

async function fetchKeys() {
  // Local testing only: another key set (scripts/test-mobile-auth.mjs signs its own tokens)
  const url = (!isProduction() && process.env.GOOGLE_JWKS_URL) || JWKS_URL
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`Google keys: HTTP ${res.status}`)
  const body = await res.json()
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1])
  const keys = new Map()
  for (const k of body?.keys ?? []) if (k.kty === "RSA" && k.kid) keys.set(k.kid, crypto.createPublicKey({ key: k, format: "jwk" }))
  jwks = { keys, until: Date.now() + (maxAge > 0 ? maxAge * 1000 : DEFAULT_TTL_MS), fetchedAt: Date.now() }
}

// Outside production, keys the test script stores in the platform setting "test_google_jwks"
// ({ keys: [jwk] }) count too. Read straight from the table (no cache) so a test sees its own keys.
async function testKey(kid) {
  if (isProduction()) return null
  try {
    const row = await platformDb()("settings").where({ key: "test_google_jwks" }).first("value")
    const jwk = (fromJson(row?.value)?.keys ?? []).find((k) => k.kid === kid && k.kty === "RSA")
    return jwk ? crypto.createPublicKey({ key: jwk, format: "jwk" }) : null
  } catch {
    return null
  }
}

async function publicKey(kid) {
  const test = await testKey(kid)
  if (test) return test
  if (Date.now() > jwks.until || (!jwks.keys.has(kid) && Date.now() - jwks.fetchedAt > REFETCH_MS)) await fetchKeys()
  return jwks.keys.get(kid) ?? null
}

const part = (s) => JSON.parse(Buffer.from(s, "base64url").toString())

// The verified profile { sub, email, name, picture } or throws with a short reason (never the token)
export async function verifyGoogleIdToken(idToken) {
  const pieces = String(idToken ?? "").split(".")
  if (pieces.length !== 3 || idToken.length > 4096) throw new Error("malformed")
  let header, claims
  try {
    header = part(pieces[0])
    claims = part(pieces[1])
  } catch {
    throw new Error("malformed")
  }
  if (header.alg !== "RS256" || !header.kid) throw new Error("unsupported algorithm")
  const key = await publicKey(header.kid)
  if (!key) throw new Error("unknown key")
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${pieces[0]}.${pieces[1]}`), key, Buffer.from(pieces[2], "base64url"))
  if (!ok) throw new Error("bad signature")

  const now = Math.floor(Date.now() / 1000)
  if (!ISSUERS.includes(claims.iss)) throw new Error("wrong issuer")
  const audiences = googleAudiences()
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.some((a) => audiences.includes(a))) throw new Error("wrong audience")
  // azp is the client that asked (the iOS or Android app); checked once their IDs are set
  if (claims.azp && audiences.length > 1 && !audiences.includes(claims.azp)) throw new Error("wrong client")
  if (!claims.exp || claims.exp < now - SKEW_S) throw new Error("expired")
  if (claims.iat && claims.iat > now + SKEW_S) throw new Error("issued in the future")
  if (!claims.sub || !claims.email) throw new Error("no account details")
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("unverified email")

  const picture = typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture.replace(/=s\d+-c$/, "=s256-c") : null
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name || claims.email.split("@")[0], picture }
}
