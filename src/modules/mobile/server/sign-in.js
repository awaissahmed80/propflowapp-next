import "server-only"
import crypto from "node:crypto"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashPassword, hashToken, readSigned, signValue, verifyPassword } from "@/server/auth/secrets"
import { getStaffRole } from "@/server/auth/dal"
import { logAttempt, recordLogin } from "@/server/auth/password-check"
import { OPEN, createMobileSession, endMobileSession, mobileAccess } from "@/server/auth/mobile-session"
import { getSiteSettings } from "@/server/platform-settings"
import { logActivity } from "@/server/tenants/activity"
import { MIN_PASSWORD } from "@/lib/password"
import { userProfile, workspaceProfile } from "./profile"

// The mobile app's sign-in (docs/mobile-api.md), the same rules as the web's (server/auth/
// sign-in.js) without cookies: between steps the app holds a short-lived signed ticket instead.
// Every step answers one of:
//   { next: "change_password", ticket, policy }    a temporary password: choose your own first
//   { next: "choose", ticket, workspaces }          more than one workspace
//   { token, expiresAt, sessionId, user, workspace }   signed in
//   { error, values? }                              an app error code (api.js)
// PropFlow staff (console) have no workspace to open on the phone: no_workspace.

const TICKET_MINUTES = 10
const PURPOSE = "mobile-ticket"

// ---------- tickets ----------
// A signed value the app sends back with the next step. Each is used once: a one_time_codes row
// (by the hash of its random id) is consumed when the step it opens is done.
// data: { u: user id, m: method, d: device, ... }
async function issueTicket(kind, data) {
  const id = crypto.randomBytes(18).toString("base64url")
  const exp = Date.now() + TICKET_MINUTES * 60_000
  await authDb()("oneTimeCodes").insert({ userId: data.u, purpose: PURPOSE, codeHash: hashToken(id), expiresAt: new Date(exp) })
  return signValue({ ...data, k: kind, j: id, exp })
}

// The ticket's data when it is genuine, of this kind, not expired and not used; else null
export async function readTicket(value, kind) {
  const t = readSigned(value)
  if (!t || t.k !== kind || !t.j || t.exp < Date.now()) return null
  const row = await authDb()("oneTimeCodes")
    .where({ purpose: PURPOSE, codeHash: hashToken(t.j) })
    .whereNull("consumedAt")
    .where("expiresAt", ">", new Date())
    .first("id")
  return row ? { ...t, rowId: row.id } : null
}

// Use it up; false when another request already did
async function spendTicket(t) {
  return (await authDb()("oneTimeCodes").where({ id: t.rowId }).whereNull("consumedAt").update({ consumedAt: new Date() })) === 1
}

const person = (id) => live(authDb(), "users").where({ id, status: "active" }).first("id", "name", "email", "phone", "avatarUrl", "mustChangePassword")

// The workspaces someone may open on the phone, default first: [{ key, tenantId, code, name, city, open }]
export async function mobileWorkspaces(userId) {
  const memberships = await authDb()("memberships").where({ userId, status: "active" }).whereNull("deletedAt").orderBy("isDefault", "desc").orderBy("id").select("tenantId")
  if (!memberships.length) return []
  const tenants = await live(platformDb(), "tenants")
    .whereIn(
      "id",
      memberships.map((m) => m.tenantId),
    )
    .select("id", "code", "name", "city", "status")
  const byId = new Map(tenants.map((t) => [t.id, t]))
  return memberships
    .map((m) => byId.get(m.tenantId))
    .filter(Boolean)
    .map((t) => ({ key: t.code, tenantId: t.id, code: t.code, name: t.name, city: t.city ?? null, open: OPEN.includes(t.status) }))
}
const chooserList = (list) => list.map(({ key, code, name, city }) => ({ key, code, name, city }))

// ---------- steps ----------
// ctx: { method: "password" | "google", device, ip }

// After the password or Google token: where they can go. user: an active users row.
export async function afterIdentity(user, ctx) {
  const staff = await getStaffRole(user.id)
  if (!staff && (await getSiteSettings()).maintenance) {
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: "maintenance" })
    return { error: "maintenance" }
  }
  const list = await mobileWorkspaces(user.id)
  const open = list.filter((w) => w.open)
  if (!open.length) {
    const code = list.length ? "workspace_suspended" : "no_workspace"
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: list.length ? "workspace-suspended" : "no-workspace" })
    return { error: code }
  }
  await recordLogin(user, ctx.method === "google" ? "ok-google" : "ok")
  return proceed(await person(user.id), open, ctx)
}

// A new password first (temporary password), then the chooser or the one workspace
async function proceed(user, open, ctx) {
  if (!user) return { error: "unauthorised" }
  if (user.mustChangePassword) return { next: "change_password", ticket: await issueTicket("change_password", { u: user.id, m: ctx.method, d: ctx.device }), policy: { minLength: MIN_PASSWORD } }
  if (open.length === 1) return startSession(user, open[0], ctx)
  return { next: "choose", ticket: await issueTicket("choose", { u: user.id, m: ctx.method, d: ctx.device }), workspaces: chooserList(open) }
}

// POST /auth/change-password with a change_password ticket → the next step, or { error, values? }
export async function changePasswordStep(t, password, ctx) {
  const db = authDb()
  const user = await live(db, "users").where({ id: t.u, status: "active" }).first("id", "passwordHash")
  if (!user) return { error: "unauthorised" }
  if (password.length < MIN_PASSWORD || password.length > 128) return { error: "password_weak", values: { minLength: MIN_PASSWORD } }
  if (user.passwordHash && (await verifyPassword(user.passwordHash, password))) return { error: "password_same" }
  if (!(await spendTicket(t))) return { error: "ticket_expired" }
  const now = new Date()
  await db("users")
    .where({ id: user.id })
    .update({ passwordHash: await hashPassword(password), mustChangePassword: false, passwordChangedAt: now, updatedAt: now, updatedBy: user.id })
  const open = (await mobileWorkspaces(user.id)).filter((w) => w.open)
  if (!open.length) return { error: "workspace_suspended" }
  return proceed(await person(user.id), open, ctx)
}

// POST /auth/choose with a choose ticket
export async function chooseWorkspace(t, key, ctx) {
  const user = await person(t.u)
  if (!user) return { error: "unauthorised" }
  const found = (await mobileWorkspaces(user.id)).find((w) => w.key === key)
  if (!found) return { error: "no_access" }
  if (!found.open) return { error: "workspace_suspended" }
  // Used once, even if two requests race
  if (!(await spendTicket(t))) return { error: "ticket_expired" }
  return startSession(user, found, ctx)
}

// POST /auth/switch: a signed-in phone opens another of the person's workspaces; the new session
// replaces this one. access: mobileAccess of the current session.
export async function switchWorkspace(access, key, ctx) {
  const user = await person(access.user.id)
  if (!user) return { error: "unauthorised" }
  const found = (await mobileWorkspaces(user.id)).find((w) => w.key === key)
  if (!found) return { error: "no_access" }
  if (!found.open) return { error: "workspace_suspended" }
  return startSession(user, found, { ...ctx, replaces: access.session.id })
}

// The session, in the workspace's Activity Log like a browser sign-in
async function startSession(user, workspace, ctx) {
  const { id, token, expiresAt } = await createMobileSession({ userId: user.id, tenantId: workspace.tenantId, device: ctx.device, ip: ctx.ip })
  if (ctx.replaces) await endMobileSession(ctx.replaces)
  const tenant = await platformDb()("tenants").where({ id: workspace.tenantId }).first("dbName", "dbHost")
  const how = `${ctx.device.platform === "ios" ? "iOS" : "Android"} app${ctx.method === "google" ? " with Google" : ""}`
  if (tenant) await logActivity(tenantDb(tenant), { type: "sign-in", action: "member.signed_in", actorUserId: user.id, summary: `signed in on the ${how}`, ip: ctx.ip })
  // The same profile GET /me answers, from the new session's point of view
  const access = await mobileAccess({ headers: new Headers({ authorization: `Bearer ${token}` }) })
  if (access.deny) return { error: access.deny === "suspended" ? "workspace_suspended" : "no_access" }
  return { token, expiresAt: expiresAt.toISOString(), sessionId: id, user: userProfile(access.user), workspace: await workspaceProfile(access) }
}
