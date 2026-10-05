import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getPortal } from "@/modules/portal/server/context"

// Who's asking and what they may see in Dashboards.
//   can("view")      open the app (dashboards.view)
//   has(feature)     a dashboard the workspace has (executive, sales, finance, inventory,
//                    after-sales, people; portal/features.js)
//   source(app)      that app's own context (CRM's, Finance's…) when the person can open it in
//                    this workspace, else null. Every card reads through its source's context,
//                    so it follows that app's scope (own / team / all) and grants.
export const dashboardsContext = cache(async (path = "/dashboards") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, portal] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "dashboards" }).first("a.id", "ta.offFeatures"),
    getPortal(),
  ])
  const permissions = role?.permissions ?? []
  const apps = new Set(portal.apps.map((a) => a.code))
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    has: (feature) => Boolean(subscribed) && !cleanOff("dashboards", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "dashboards", action),
    source: (app) => (apps.has(app) ? sourceContext(app) : Promise.resolve(null)),
  }
})

// Each app's context, imported only when a card needs it
const LOADERS = {
  crm: () => import("@/modules/crm/server/context").then((m) => m.crmContext()),
  campaigns: () => import("@/modules/campaigns/server/context").then((m) => m.campaignsContext()),
  operations: () => import("@/modules/operations/server/context").then((m) => m.salesContext()),
  estate: () => import("@/modules/estate/server/context").then((m) => m.servicesContext()),
  finance: () => import("@/modules/finance/server/context").then((m) => m.financeContext()),
  hr: () => import("@/modules/hr/server/context").then((m) => m.hrContext()),
  portfolio: () => import("@/modules/portfolio/server/context").then((m) => m.estateContext()),
}

// The app's context when the person may view it, else null (once per request)
const sourceContext = cache(async (app) => {
  const load = LOADERS[app]
  if (!load) return null
  const ctx = await load()
  return ctx?.can("view") ? ctx : null
})

// A dashboard page: needs dashboards.view and the dashboard's feature; 404 otherwise
export async function dashboardsPage(path, feature) {
  const ctx = await dashboardsContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}
