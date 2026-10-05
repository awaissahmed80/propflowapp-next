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

// ---------- signing in as a member (console staff, from a workspace's page) ----------
// The staff member's own console token is kept in a second httpOnly cookie while they're signed
// in as someone else, and put back when they exit, so they don't have to sign in again.
const STAFF_COOKIE = () => `${COOKIE()}_console`
export const IMPERSONATION_MINUTES = 60

export async function createImpersonationSession({ userId, tenantId, impersonatorUserId, impersonationId }) {
  const jar = await cookies()
  const staffToken = jar.get(COOKIE())?.value
  if (staffToken) jar.set(STAFF_COOKIE(), staffToken, { ...cookieOptions(), maxAge: SHORT_HOURS * 3600 })
  const token = newToken()
  const { ip, userAgent } = await requestInfo()
  const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60_000)
  await authDb()("sessions").insert({ tokenHash: hashToken(token), userId, kind: "tenant", tenantId, impersonatorUserId, impersonationId, ip, userAgent, lastSeenAt: new Date(), expiresAt })
  jar.set(COOKIE(), token, cookieOptions())
  return expiresAt
}

// End the member session and give the staff member their console session back
export async function restoreStaffSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE())?.value
  if (token)
    await authDb()("sessions")
      .where({ tokenHash: hashToken(token) })
      .whereNull("revokedAt")
      .update({ revokedAt: new Date() })
  const staffToken = jar.get(STAFF_COOKIE())?.value
  jar.set(COOKIE(), staffToken ?? "", { ...cookieOptions(), ...(staffToken ? {} : { maxAge: 0 }) })
  jar.set(STAFF_COOKIE(), "", { ...cookieOptions(), maxAge: 0 })
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
      "s.impersonationId",
      "s.lastSeenAt",
      "s.expiresAt",
      "s.lockedAt",
      "s.unlockAttempts",
      "u.id as userId",
      "u.name",
      "u.email",
      "u.avatarUrl",
      "u.mustChangePassword",
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
    impersonationId: row.impersonationId,
    expiresAt: row.expiresAt,
    // Screen lock (portal): set while this browser is locked, until the passcode or password is entered
    lockedAt: row.lockedAt,
    unlockAttempts: row.unlockAttempts,
    user: { id: row.userId, name: row.name, email: row.email, avatarUrl: row.avatarUrl, mustChangePassword: row.mustChangePassword },
  }
}

// Sign this browser out: revoke the row and overwrite the cookie on the same domain
// (a cookie set for .propflowapp.test can only be removed with that same domain)
export async function endSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE())?.value
  if (token) {
    await authDb()("sessions")
      .where({ tokenHash: hashToken(token) })
      .whereNull("revokedAt")
      .update({ revokedAt: new Date() })
  }
  jar.set(COOKIE(), "", { ...cookieOptions(), maxAge: 0 })
}
