import "server-only"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashToken, newToken } from "@/server/auth/secrets"

// PropFlow mobile app sessions (docs/mobile-api.md): rows of pf_auth.sessions with kind "mobile",
// for one workspace. The app holds a random token and sends it as "Authorization: Bearer <token>";
// only its SHA-256 is kept, as for browsers. Cookie sessions never accept these rows (requireTenant
// and requireStaff check the kind), and these never accept cookies.
// The session slides: it ends after MOBILE_SESSION_DAYS (default 60) without the app being used, or
// when signed out (here, on the profile page's devices list, or by a password change).

export const MOBILE = "mobile"
export const OPEN = ["trial", "active", "past_due"]
const DAYS = () => Number(process.env.MOBILE_SESSION_DAYS || 60)
// last_seen_at (and the sliding expiry) is written at most this often, not on every request
const TOUCH_MS = 5 * 60_000

export const bearerToken = (request) => /^Bearer\s+([A-Za-z0-9_-]{40,200})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null
export const clientIp = (request) => (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "").slice(0, 45) || null

// The phone in words for the devices list and the sign-in history, e.g. "PropFlowApp/1.0.0 (iPhone; Ali's iPhone)"
export function deviceAgent(device) {
  const system = device.platform === "ios" ? (/ipad/i.test(device.name) ? "iPad" : "iPhone") : "Android; Mobile"
  return `PropFlowApp/${device.appVersion ?? "0"} (${system}; ${device.name})`.slice(0, 255)
}

// → { id, token (shown once), expiresAt }
export async function createMobileSession({ userId, tenantId, device, ip }) {
  const token = newToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + DAYS() * 86_400_000)
  const [id] = await authDb()("sessions").insert({
    tokenHash: hashToken(token),
    userId,
    kind: MOBILE,
    tenantId,
    deviceName: device.name,
    platform: device.platform,
    appVersion: device.appVersion ?? null,
    pushToken: device.pushToken ?? null,
    ip,
    userAgent: deviceAgent(device),
    lastSeenAt: now,
    expiresAt,
  })
  return { id, token, expiresAt }
}

// Who is calling: { session, user, tenant, membership } (the same shape requireTenant gives the
// web, so the apps' contexts work unchanged) or { deny }: unauthorised (no, unknown, expired or
// revoked token: sign in again), password (a new password is needed first), suspended (the
// workspace is suspended), no_access (no longer a member, or the workspace is closed: the session
// is ended too).
export async function mobileAccess(request, { appVersion } = {}) {
  const token = bearerToken(request)
  if (!token) return { deny: "unauthorised" }
  const db = authDb()
  const row = await db("sessions as s")
    .join("users as u", "u.id", "s.userId")
    .where({ "s.tokenHash": hashToken(token), "s.kind": MOBILE })
    .whereNull("s.revokedAt")
    .where("s.expiresAt", ">", new Date())
    .whereNull("u.deletedAt")
    .where("u.status", "active")
    .first("s.id", "s.tenantId", "s.deviceName", "s.platform", "s.appVersion", "s.lastSeenAt", "s.expiresAt", "u.id as userId", "u.name", "u.email", "u.phone", "u.avatarUrl", "u.mustChangePassword")
  if (!row) return { deny: "unauthorised" }
  if (row.mustChangePassword) return { deny: "password" }

  const [membership, tenant] = await Promise.all([
    db("memberships").where({ userId: row.userId, tenantId: row.tenantId, status: "active" }).whereNull("deletedAt").first("id", "roleId", "isDefault"),
    live(platformDb(), "tenants").where({ id: row.tenantId }).first("id", "code", "slug", "name", "city", "status", "planId", "trialEndsAt", "dbName", "dbHost"),
  ])
  if (tenant?.status === "suspended") return { deny: "suspended" }
  if (!membership || !tenant || !OPEN.includes(tenant.status)) {
    await db("sessions").where({ id: row.id }).whereNull("revokedAt").update({ revokedAt: new Date() })
    return { deny: "no_access" }
  }

  const user = { id: row.userId, name: row.name, email: row.email, phone: row.phone, avatarUrl: row.avatarUrl, mustChangePassword: false }
  const session = { id: row.id, kind: MOBILE, tenantId: row.tenantId, deviceName: row.deviceName, platform: row.platform, appVersion: row.appVersion, expiresAt: row.expiresAt, user }
  // Seen now: last_seen_at, the app's version when it changed, and the sliding expiry
  const version = appVersion && appVersion !== row.appVersion ? appVersion : null
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > TOUCH_MS || version) {
    session.expiresAt = new Date(Date.now() + DAYS() * 86_400_000)
    await db("sessions")
      .where({ id: row.id })
      .update({ lastSeenAt: new Date(), expiresAt: session.expiresAt, ip: clientIp(request), ...(version ? { appVersion: version } : {}) })
    if (version) session.appVersion = version
  }
  return { session, user, tenant, membership }
}

// Sign this phone out (POST /auth/sign-out)
export const endMobileSession = (id) => authDb()("sessions").where({ id, kind: MOBILE }).whereNull("revokedAt").update({ revokedAt: new Date() })

// A new push token for this phone (the OS may change it)
export const setPushToken = (id, pushToken) => authDb()("sessions").where({ id, kind: MOBILE }).update({ pushToken })
