"use server"

import { redirect } from "next/navigation"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { IMPERSONATION_MINUTES, createImpersonationSession, requestInfo } from "@/server/auth/session"
import { siteUrl } from "@/lib/sites"
import { urlCode } from "@/lib/url"
import { canImpersonate } from "@/modules/console/roles"
import { logAudit } from "./audit"

// Sign in as a member of a workspace, to see and do what they do (support). Owner, admin and
// support staff only; a reason is required; the session lasts IMPERSONATION_MINUTES and every
// start and end is in the console audit log (and pf_platform.impersonations, never deleted).
//   → redirects to the portal (from the server, so the console page isn't refreshed with the
//     member's session first) | { error }
export async function startImpersonation(tenantCode, userId, reason) {
  const staff = await requireStaff(`/workspaces/${urlCode(tenantCode ?? "")}`)
  if (!canImpersonate(staff.role)) return { error: "Your console role can't sign in as members." }
  const why = String(reason ?? "").trim()
  if (why.length < 5) return { error: "Say why you're signing in as them (at least a few words)." }
  const tenant = await live(platformDb(), "tenants")
    .where({ code: String(tenantCode ?? "").toUpperCase() })
    .first("id", "code", "name", "status")
  if (!tenant) return { error: "That workspace was removed." }
  if (!["trial", "active", "past_due"].includes(tenant.status)) return { error: "The workspace isn't open, so nobody can sign in to it." }
  const id = Number(userId)
  if (id === staff.user.id) return { error: "That's you. Open the portal normally instead." }
  const [user, membership] = await Promise.all([
    authDb()("users").where({ id, status: "active" }).whereNull("deletedAt").first("id", "name", "email"),
    authDb()("memberships").where({ userId: id, tenantId: tenant.id, status: "active" }).whereNull("deletedAt").first("id"),
  ])
  if (!user || !membership) return { error: "They aren't an active member of this workspace." }
  const { ip, userAgent } = await requestInfo()
  // Close any earlier impersonation of this staff member that was left open (timed out)
  const stale = await platformDb()("impersonations").where({ staffUserId: staff.user.id }).whereNull("endedAt").select("id", "tenantId", "targetUserId")
  for (const x of stale) {
    await platformDb()("impersonations").where({ id: x.id }).update({ endedAt: new Date() })
    await logAudit({
      actorUserId: staff.user.id,
      action: "impersonation.ended",
      subjectType: "user",
      subjectId: x.targetUserId,
      tenantId: x.tenantId,
      details: { summary: "Closed when a new one started (wasn't exited)" },
    })
  }
  const [impersonationId] = await platformDb()("impersonations").insert({ staffUserId: staff.user.id, tenantId: tenant.id, targetUserId: user.id, reason: why.slice(0, 255), ip, userAgent })
  await logAudit({
    actorUserId: staff.user.id,
    action: "impersonation.started",
    subjectType: "user",
    subjectId: user.id,
    tenantId: tenant.id,
    details: { summary: `${user.name} (${user.email}) · ${why.slice(0, 200)}`, minutes: IMPERSONATION_MINUTES },
  })
  await createImpersonationSession({ userId: user.id, tenantId: tenant.id, impersonatorUserId: staff.user.id, impersonationId })
  redirect(siteUrl("portal", "/"))
}
