"use server"

import { redirect } from "next/navigation"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { getSession } from "@/server/auth/dal"
import { siteUrl } from "@/lib/sites"
import { logToWorkspace } from "@/server/tenants/activity"

// Open another workspace the person belongs to, in this same session
export async function switchWorkspace(tenantId) {
  const session = await getSession()
  if (session?.kind !== "tenant") redirect(siteUrl("auth"))
  const id = Number(tenantId)
  const [membership, tenant] = await Promise.all([
    authDb()("memberships").where({ userId: session.user.id, tenantId: id, status: "active" }).whereNull("deletedAt").first("id"),
    live(platformDb(), "tenants").where({ id }).first("id", "status"),
  ])
  if (!membership || !tenant || !["trial", "active", "past_due"].includes(tenant.status)) {
    return { error: "You can't open that workspace right now." }
  }
  await authDb()("sessions").where({ id: session.id }).update({ tenantId: id, lastSeenAt: new Date() })
  await logToWorkspace(id, { type: "sign-in", action: "member.switched_in", actorUserId: session.user.id, summary: "opened this workspace from another one" })
  redirect(siteUrl("portal"))
}
