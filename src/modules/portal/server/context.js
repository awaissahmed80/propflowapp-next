import "server-only"
import { cleanOff } from "@/modules/portal/features"
import { cache } from "react"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { canOpenApp } from "@/modules/portal/access"
import { canSetUp } from "@/modules/portal/server/setup"

const DAY = 86_400_000

// Everything the portal frame and launcher need, once per request:
// the person, their workspace role, the workspace (plan, trial), the apps they can open,
// and their other workspaces for the switcher. Sends anyone without access to sign in.
export const getPortal = cache(async () => {
  const s = await requireTenant("/")
  const tdb = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const platform = platformDb()

  const [role, apps, plan, memberships, setupRow] = await Promise.all([
    live(tdb, "roles").where({ id: s.membership.roleId }).first("id", "code", "name", "permissions"),
    platform("tenantApps as ta")
      .join("apps as a", "a.id", "ta.appId")
      .where("ta.tenantId", s.tenant.id)
      .whereNull("a.deletedAt")
      .where("a.isActive", true)
      .orderBy("a.sortOrder")
      .select("a.code", "a.name", "a.description", "a.icon", "a.color", "a.category", "a.alwaysOn", "ta.offFeatures"),
    platform("plans").where({ id: s.tenant.planId }).first("name"),
    authDb()("memberships").where({ userId: s.user.id, status: "active" }).whereNull("deletedAt").select("tenantId"),
    tdb("settings").where({ key: "setup_completed_at" }).first("value"),
  ])

  const others = memberships.filter((m) => m.tenantId !== s.tenant.id).map((m) => m.tenantId)
  const workspaces = others.length ? await live(platform, "tenants").whereIn("id", others).orderBy("name").select("id", "code", "name", "status") : []

  const permissions = role?.permissions ?? []
  return {
    user: s.user,
    sessionId: s.id,
    role: { code: role?.code ?? null, name: role?.name ?? "Member", isOwner: role?.code === "owner" },
    tenant: {
      id: s.tenant.id,
      code: s.tenant.code,
      name: s.tenant.name,
      slug: s.tenant.slug,
      city: s.tenant.city,
      status: s.tenant.status,
      plan: plan?.name ?? null,
      trialDaysLeft: s.tenant.status === "trial" && s.tenant.trialEndsAt ? Math.max(0, Math.ceil((s.tenant.trialEndsAt - Date.now()) / DAY)) : null,
    },
    // off: features of the app this workspace doesn't have (see portal/features.js)
    apps: apps.filter((a) => a.alwaysOn || canOpenApp(permissions, a.code)).map(({ offFeatures, ...a }) => ({ ...a, off: cleanOff(a.code, offFeatures) })),
    // Until the owner finishes Get started, the apps stay closed
    setupCompleted: Boolean(setupRow?.value),
    canSetUp: canSetUp(permissions),
    workspaces: workspaces.map((w) => ({ ...w, open: ["trial", "active", "past_due"].includes(w.status) })),
  }
})
