import "server-only"
import { cookies, headers } from "next/headers"
import { authDb } from "@/server/db/connections"
import { hashToken, newToken } from "@/server/auth/secrets"

// Browser sessions: a random token in an httpOnly cookie shared by every PropFlow subdomain
// (COOKIE_DOMAIN=.propflowapp.test), and its SHA-256 in pf_auth.sessions. Revoking the row
// signs that browser out everywhere at once.

const COOKIE = () => process.env.SESSION_COOKIE_NAME || "pf_session"
const TTL_DAYS = () => Number(process.env.SESSION_TTL_DAYS || 30)
// Without "keep me signed in" the cookie dies with the browser, and the server gives up after 12 hours
const SHORT_HOURS = 12
// last_seen_at is written at most this often, not on every request
const TOUCH_MS = 5 * 60_000

const cookieOptions = () => ({
  httpOnly: true,
  secure: (process.env.APP_PROTOCOL || "https") === "https",
  sameSite: "lax",
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
})

// Who is asking: behind Valet / nginx the address comes in a forwarded header
export async function requestInfo() {
  const h = await headers()
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null
  return { ip: ip?.slice(0, 45) ?? null, userAgent: h.get("user-agent")?.slice(0, 255) ?? null }
}

// kind: "console" for platform staff, "tenant" for a workspace (tenantId required)
export async function createSession({ userId, kind, tenantId = null, remember }) {
  const token = newToken()
  const ms = remember ? TTL_DAYS() * 86_400_000 : SHORT_HOURS * 3_600_000
  const { ip, userAgent } = await requestInfo()
  await authDb()("sessions").insert({
    tokenHash: hashToken(token),
    userId,
    kind,
    tenantId,
    ip,
    userAgent,
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + ms),
  })
  const jar = await cookies()
  jar.set(COOKIE(), token, { ...cookieOptions(), ...(remember ? { maxAge: Math.floor(ms / 1000) } : {}) })
}

// The signed-in session for this request, or null. Checks expiry, revocation and the user's status.
export async function readSession() {
  const token = (await cookies()).get(COOKIE())?.value
  if (!token) return null
  const db = authDb()
  const row = await db("sessions as s")
    .join("users as u", "u.id", "s.userId")
    .where("s.tokenHash", hashToken(token))
    .whereNull("s.revokedAt")
    .where("s.expiresAt", ">", new Date())
    .whereNull("u.deletedAt")
    .where("u.status", "active")
    .first(
      "s.id",
      "s.kind",
      "s.tenantId",
      "s.impersonatorUserId",
      "s.lastSeenAt",
      "s.expiresAt",
      "u.id as userId",
      "u.name",
      "u.email",
      "u.avatarUrl",
      "u.mustChangePassword"
    )
  if (!row) return null
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db("sessions").where({ id: row.id }).update({ lastSeenAt: new Date() })
  }
  return {
    id: row.id,
    kind: row.kind,
    tenantId: row.tenantId,
    impersonatorUserId: row.impersonatorUserId,
    expiresAt: row.expiresAt,
    user: { id: row.userId, name: row.name, email: row.email, avatarUrl: row.avatarUrl, mustChangePassword: row.mustChangePassword },
  }
}

// Sign this browser out: revoke the row and overwrite the cookie on the same domain
// (a cookie set for .propflowapp.test can only be removed with that same domain)
export async function endSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE())?.value
  if (token) {
    await authDb()("sessions").where({ tokenHash: hashToken(token) }).whereNull("revokedAt").update({ revokedAt: new Date() })
  }
  jar.set(COOKIE(), "", { ...cookieOptions(), maxAge: 0 })
}
