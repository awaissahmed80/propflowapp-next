import "server-only"
import crypto from "node:crypto"
import { authDb } from "@/server/db/connections"
import { hashToken, newToken } from "@/server/auth/secrets"

// Google sign-in for the desktop app (propflow-desktop). Google won't sign in inside the app, so
// the app opens /api/auth/google/start in the browser with ?desktop=<challenge>, the SHA-256 of a
// secret only the app holds. After Google, instead of signing the browser in, we make a one-time
// code (2 minutes, single use) and hand it to the app with propflow://auth?code=…; the app then
// opens /api/auth/desktop/redeem?code=…&verifier=<its secret> and is signed in there. A code that
// leaks (browser history, another app catching the link) is useless without the secret.

const PURPOSE = "desktop"
const TTL_MS = 2 * 60_000

export const isChallenge = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v)
const stored = (code, challenge) => hashToken(`${code}.${challenge}`)

// → the code to hand to the app
export async function createHandoff(user, { challenge, ip = null }) {
  const code = newToken()
  await authDb()("oneTimeCodes").insert({ userId: user.id, email: user.email, purpose: PURPOSE, codeHash: stored(code, challenge), expiresAt: new Date(Date.now() + TTL_MS), ip })
  return code
}

// → the user id, once; null when the code is wrong, used, expired or the secret doesn't match
export async function redeemHandoff(code, verifier) {
  if (typeof code !== "string" || typeof verifier !== "string" || code.length > 100 || verifier.length > 200) return null
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")
  const db = authDb()
  const row = await db("oneTimeCodes").where({ purpose: PURPOSE, codeHash: stored(code, challenge) }).whereNull("consumedAt").where("expiresAt", ">", new Date()).first("id", "userId")
  if (!row) return null
  // Used once, even if two requests race
  const used = await db("oneTimeCodes").where({ id: row.id }).whereNull("consumedAt").update({ consumedAt: new Date() })
  return used === 1 ? row.userId : null
}

export const desktopLink = (code) => `propflow://auth?code=${encodeURIComponent(code)}`
