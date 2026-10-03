import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"

// Who's asking and what their role lets them do in Project Portfolio.
//   view    see projects and inventory
//   create  add projects and inventory
//   edit    change projects; hold, block, allocate and reprice units; draft price lists
//   approve activate price lists
export const estateContext = cache(async (path = "/project-portfolio") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "portfolio" }).first("a.id", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    // Features of this app the workspace has (portal/features.js); off ones are switched off by plan or package
    has: (feature) => Boolean(subscribed) && !cleanOff("portfolio", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "portfolio", action),
  }
})

// feature: a part of Project Portfolio the page belongs to (e.g. "resale"); 404 without it
export async function estatePage(path, feature = null) {
  const ctx = await estateContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't add projects or inventory. Ask an administrator.",
  edit: "Your role can't change projects or inventory. Ask an administrator.",
  approve: "Your role can't activate price lists. Ask an administrator.",
}

export async function estateAction(action, feature = null) {
  const ctx = await estateContext()
  if (feature && !ctx.has(feature)) return { error: "This part of Project Portfolio isn't in your plan. Ask PropFlow to add it." }
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  return { ctx }
}
