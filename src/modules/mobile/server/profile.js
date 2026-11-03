import "server-only"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { actionsIn } from "@/modules/users/permissions"
import { canOpenApp } from "@/modules/portal/access"
import { cleanOff } from "@/modules/portal/features"

// Who the phone is signed in as, and in which workspace, for GET /me and the end of sign-in.

export const userProfile = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone ?? null, avatarUrl: u.avatarUrl ?? null })

// The apps the mobile app has screens for
const MOBILE_APPS = ["crm", "portfolio", "operations", "contacts"]

// access: mobileAccess → { key, code, name, city, role: { code, name }, apps: { crm: { actions, off } … } }
// apps: only those the workspace has and the role may open; actions: what the role may do there
// (view / create / edit / delete / approve / export); off: the app's features the plan leaves out
export async function workspaceProfile(access) {
  const { tenant, membership } = access
  const db = tenantDb({ dbName: tenant.dbName, dbHost: tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: membership.roleId }).first("code", "name", "permissions"),
    platformDb()("tenantApps as ta")
      .join("apps as a", "a.id", "ta.appId")
      .where("ta.tenantId", tenant.id)
      .whereNull("a.deletedAt")
      .where("a.isActive", true)
      .whereIn("a.code", MOBILE_APPS)
      .select("a.code", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  const apps = Object.fromEntries(subscribed.filter((a) => canOpenApp(permissions, a.code)).map((a) => [a.code, { actions: actionsIn(permissions, a.code), off: cleanOff(a.code, a.offFeatures) }]))
  return { key: tenant.code, code: tenant.code, name: tenant.name, city: tenant.city ?? null, role: { code: role?.code ?? null, name: role?.name ?? "Member" }, apps }
}
