import "server-only"
import { getPortal } from "@/modules/portal/server/context"
import { requireTenant } from "@/server/auth/dal"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { canOpenApp } from "@/modules/portal/access"
import { canSetUp } from "@/modules/portal/server/setup"
import { APP_PERMISSIONS, SCOPE_LABELS, actionsIn, isFullAccess, roleAccess } from "@/modules/users/permissions"

// Everything the User Guide pages need, for the person's role, or (owners and administrators) for
// any role: ?role=sales-agent. → { me, role, apps, grants, roles, grantLabels, matrix }
export async function loadGuide(path, roleParam) {
  const s = await requireTenant(path)
  const portal = await getPortal()
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const mine = await live(db, "roles").where({ id: s.membership.roleId }).first("code", "name", "permissions", "scope", "grants")
  const admin = isFullAccess(mine?.permissions ?? [])
  const roles = admin ? await live(db, "roles").orderBy("sortOrder").select("code", "name", "description", "permissions", "scope", "grants") : []
  const role = (roleParam && roles.find((r) => r.code === roleParam)) || mine || { code: null, name: "Member", permissions: [] }

  // The workspace's apps, then the ones this role opens (My Desk first)
  const catalog = await platformDb()("tenantApps as ta")
    .join("apps as a", "a.id", "ta.appId")
    .where("ta.tenantId", s.tenant.id)
    .whereNull("a.deletedAt")
    .where("a.isActive", true)
    .orderBy("a.sortOrder")
    .select("a.code", "a.name", "a.icon", "a.color", "a.alwaysOn")
  const opens = (permissions, a) => a.code === "desk" || a.alwaysOn || canOpenApp(permissions, a.code)
  const permissions = role.permissions ?? []
  const { scope, grants } = roleAccess({ permissions, scope: role.scope, grants: role.grants })
  const apps = catalog
    .filter((a) => opens(permissions, a))
    .map((a) => {
      const def = APP_PERMISSIONS[a.code]
      return {
        code: a.code,
        name: a.code === "desk" ? "My Desk" : a.name,
        icon: a.code === "desk" ? "user-smile-line" : a.icon,
        color: a.code === "desk" ? "blue" : a.color,
        actions: a.code === "desk" ? ["view"] : actionsIn(permissions, a.code),
        scope: def && def.scopes.length > 1 ? { value: scope[a.code], label: SCOPE_LABELS[scope[a.code]], noun: def.noun } : null,
        grants: def ? def.grants.filter((g) => grants[g.key] && grants[g.key] !== "none").map((g) => ({ key: g.key, label: g.label, value: grants[g.key] })) : [],
      }
    })
  if (!apps.some((a) => a.code === "desk")) apps.unshift({ code: "desk", name: "My Desk", icon: "user-smile-line", color: "blue", actions: ["view"], scope: null, grants: [] })
  apps.sort((a, b) => (a.code === "desk" ? -1 : b.code === "desk" ? 1 : 0))

  // Administrators: every role against every app, as letters (V C E D A X) or Full
  const matrixApps = catalog.filter((a) => a.code !== "desk" && !a.alwaysOn)
  const LETTER = { view: "V", create: "C", edit: "E", delete: "D", approve: "A", export: "X" }
  const matrix = admin
    ? {
        apps: matrixApps.map((a) => ({ code: a.code, name: a.name, icon: a.icon, color: a.color })),
        rows: roles.map((r) => ({
          code: r.code,
          name: r.name,
          full: isFullAccess(r.permissions),
          cells: matrixApps.map((a) =>
            actionsIn(r.permissions, a.code)
              .map((x) => LETTER[x])
              .join(""),
          ),
        })),
      }
    : null

  return {
    me: { name: portal.user.name, workspace: portal.tenant.name },
    role: { code: role.code, name: role.name, full: isFullAccess(permissions), setup: canSetUp(permissions), mine: role.code === mine?.code },
    apps,
    grants: Object.fromEntries(Object.entries(grants).map(([k, v]) => [k, Boolean(v) && v !== "none" && v !== 0])),
    roles: roles.map((r) => ({ code: r.code, name: r.name })),
    grantLabels: Object.fromEntries(Object.values(APP_PERMISSIONS).flatMap((d) => d.grants.map((g) => [g.key, g.label]))),
    matrix,
  }
}
