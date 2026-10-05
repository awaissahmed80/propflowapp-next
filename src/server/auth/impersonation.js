"use server"

import { redirect } from "next/navigation"
import { authDb, platformDb } from "@/server/db/connections"
import { siteUrl } from "@/lib/sites"
import { urlCode } from "@/lib/url"
import { getSession } from "./dal"
import { restoreStaffSession } from "./session"
import { logAudit } from "@/modules/console/server/audit"

// Stop being signed in as a member (the banner's Exit, signing out, or the time running out):
// the impersonation is closed and logged, and the staff member's console session comes back.
// The URL to go back to (signOut uses this and redirects itself)
export async function endImpersonation() {
  const session = await getSession()
  if (!session?.impersonatorUserId) return { ok: true, url: siteUrl("portal", "/") }
  const tenant = session.tenantId ? await platformDb()("tenants").where({ id: session.tenantId }).first("id", "code") : null
  if (session.impersonationId) await platformDb()("impersonations").where({ id: session.impersonationId }).whereNull("endedAt").update({ endedAt: new Date() })
  const user = await authDb()("users").where({ id: session.user.id }).first("name", "email")
  await logAudit({
    actorUserId: session.impersonatorUserId,
    action: "impersonation.ended",
    subjectType: "user",
    subjectId: session.user.id,
    tenantId: session.tenantId,
    details: { summary: `${user?.name ?? "member"} (${user?.email ?? ""})` },
  })
  await restoreStaffSession()
  return { ok: true, url: siteUrl("console", tenant ? `/workspaces/${urlCode(tenant.code)}` : "/") }
}

// The banner's Exit (and the timer): end it and go back to the console from the server, so the
// portal page isn't refreshed with the console session first
export async function exitImpersonation() {
  const { url } = await endImpersonation()
  redirect(url)
}
