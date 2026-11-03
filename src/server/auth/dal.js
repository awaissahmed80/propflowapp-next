import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { cache } from "react"
import { redirect } from "next/navigation"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { readSession } from "@/server/auth/session"
import { siteUrl } from "@/lib/sites"

// Data access layer: every page, layout and server action checks access through these.
// cache() runs each lookup once per request, however many components ask.

// A mobile app request (src/app/api/mobile/v1) runs inside runAsMobile with the phone's session
// (mobile-session.js mobileAccess), so the same pages' and actions' checks below apply to it:
// getSession and requireTenant answer with that session instead of reading a cookie.
const mobile = new AsyncLocalStorage()
export const runAsMobile = (access, fn) => mobile.run(access, fn)
export const inMobileRequest = () => Boolean(mobile.getStore())

const cookieSession = cache(readSession)
export const getSession = async () => mobile.getStore()?.session ?? cookieSession()

// The console role of a user (owner | admin | finance | support), or null
export const getStaffRole = cache(async (userId) => {
  const staff = await live(platformDb(), "platform_staff").where({ userId, isActive: true }).first("role")
  return staff?.role ?? null
})

// Sign-in page URL that comes back to `returnTo` afterwards
export const signInUrl = (returnTo) => siteUrl("auth", returnTo ? `/?redirect=${encodeURIComponent(returnTo)}` : "/")

// Console pages and actions: a console session of an active staff member, or off to sign in.
// path: where to come back to, e.g. "/tenants"
export async function requireStaff(path = "/") {
  const session = await getSession()
  const role = session?.kind === "console" ? await getStaffRole(session.user.id) : null
  if (!role) redirect(signInUrl(siteUrl("console", path)))
  return { ...session, role }
}

// The workspace session's membership and workspace, looked up once per request
const tenantSession = cache(async () => {
  const session = await getSession()
  if (session?.kind !== "tenant" || !session.tenantId) return null
  const [membership, tenant] = await Promise.all([
    authDb()("memberships").where({ userId: session.user.id, tenantId: session.tenantId, status: "active" }).whereNull("deletedAt").first("id", "roleId", "isDefault"),
    live(platformDb(), "tenants").where({ id: session.tenantId }).first("id", "code", "slug", "name", "city", "status", "planId", "trialEndsAt", "dbName", "dbHost"),
  ])
  return { session, membership, tenant }
})

// Portal pages and actions: a workspace session whose membership and workspace are still open.
// Returns { ...session, tenant, membership }; anyone else goes to sign in.
export async function requireTenant(path = "/") {
  // The phone's session was checked already (membership, workspace open) by mobileAccess
  const m = mobile.getStore()
  if (m) return { ...m.session, tenant: m.tenant, membership: m.membership }
  const found = await tenantSession()
  if (!found) redirect(signInUrl(siteUrl("portal", path)))
  const { session, membership, tenant } = found
  if (tenant?.status === "suspended") redirect(siteUrl("auth", "/?error=workspace-suspended"))
  if (!membership || !tenant || !["trial", "active", "past_due"].includes(tenant.status)) redirect(signInUrl(siteUrl("portal", path)))
  return { ...session, tenant, membership }
}
