import "server-only"
import { createSession, endSession } from "@/server/auth/session"
import { logAttempt, recordLogin } from "@/server/auth/password-check"
import { getStaffRole } from "@/server/auth/dal"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { logActivity } from "@/server/tenants/activity"
import { getSiteSettings } from "@/server/platform-settings"
import { isSafeRedirect, siteForHost, siteUrl } from "@/lib/sites"
import { AUTH_ERRORS } from "@/lib/auth-errors"

// The last step of every sign-in (password, Google, reset, invitation, workspace setup), once we
// know who the person is: checks where they may go, starts the session and records the sign-in.
// Returns { url } to send them to, or { error, code } to show on the sign-in page.

// Back where they were, if that was on the site they're signing in to
function target(site, redirectTo) {
  if (redirectTo && isSafeRedirect(redirectTo) && siteForHost(new URL(redirectTo).host) === site) return redirectTo
  return siteUrl(site)
}

// The workspace to open: the one asked for (e.g. just joined), else their default one, else the
// first, among workspaces that are open
async function workspaceFor(userId, preferred) {
  const memberships = await authDb()("memberships").where({ userId, status: "active" }).whereNull("deletedAt").orderBy("isDefault", "desc").orderBy("id").select("tenantId")
  if (preferred) memberships.sort((a, b) => (b.tenantId === preferred) - (a.tenantId === preferred))
  if (!memberships.length) return null
  const open = await platformDb()("tenants")
    .whereIn(
      "id",
      memberships.map((m) => m.tenantId),
    )
    .whereIn("status", ["trial", "active", "past_due"])
    .whereNull("deletedAt")
    .pluck("id")
  return memberships.find((m) => open.includes(m.tenantId))?.tenantId ?? null
}

async function hasSuspendedWorkspace(userId) {
  const ids = (await authDb()("memberships").where({ userId, status: "active" }).whereNull("deletedAt").select("tenantId")).map((m) => m.tenantId)
  if (!ids.length) return false
  return Boolean(await platformDb()("tenants").whereIn("id", ids).where({ status: "suspended" }).whereNull("deletedAt").first("id"))
}

export async function finishSignIn(user, { method = "password", remember = true, redirectTo, tenantId: preferred } = {}) {
  const role = await getStaffRole(user.id)
  if (!role && (await getSiteSettings()).maintenance) {
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: "maintenance" })
    return { error: AUTH_ERRORS.maintenance, code: "maintenance" }
  }
  // PropFlow staff open the console; everyone else opens their workspace in the portal
  // (staff who also belong to a workspace use the console; switching comes with the portal)
  const tenantId = role ? null : await workspaceFor(user.id, preferred)
  if (!role && !tenantId) {
    // Say so when their only workspaces are suspended, rather than "no workspace"
    const suspended = await hasSuspendedWorkspace(user.id)
    const code = suspended ? "workspace-suspended" : "no-workspace"
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: code })
    return { error: AUTH_ERRORS[code], code }
  }
  await recordLogin(user, method === "google" ? "ok-google" : "ok")
  // Whoever was signed in on this browser before is signed out
  await endSession()
  if (role) {
    await createSession({ userId: user.id, kind: "console", remember })
    return { url: target("console", redirectTo) }
  }
  await createSession({ userId: user.id, kind: "tenant", tenantId, remember })
  // The workspace's Activity Log shows sign-ins too
  const tenant = await platformDb()("tenants").where({ id: tenantId }).first("dbName", "dbHost")
  if (tenant) await logActivity(tenantDb(tenant), { type: "sign-in", action: "member.signed_in", actorUserId: user.id, summary: method === "google" ? "signed in with Google" : "signed in" })
  return { url: target("portal", redirectTo) }
}
