import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"

// Who's asking and what their role lets them do in CRM.
//   view / create / edit / delete / export   the usual actions
//   scope  own | team | all   which leads they see (assigned to them / their team / everyone)
//   reassign                  may give leads to other people (grant crm.reassign)
export const crmContext = cache(async (path = "/crm") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, me, teams] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "crm" }).first("a.id", "ta.offFeatures"),
    live(db, "members").where({ userId: s.user.id }).first("teamId"),
    live(db, "teams").select("id", "leadUserId"),
  ])
  const permissions = role?.permissions ?? []
  const { scope, grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  // Teams this person is in or leads
  const myTeams = [...new Set([me?.teamId, ...teams.filter((t) => t.leadUserId === s.user.id).map((t) => t.id)].filter(Boolean))]
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    scope: scope.crm,
    myTeams,
    canReassign: Boolean(grants["crm.reassign"]),
    // Features of this app the workspace has (portal/features.js); off ones are switched off by plan or package
    has: (feature) => Boolean(subscribed) && !cleanOff("crm", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "crm", action),
  }
})

// feature: a part of CRM the page belongs to (portal/features.js); not found if the plan leaves it out
export async function crmPage(path, feature) {
  const ctx = await crmContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  // Leads nobody reached in time move on (Assignment rules); never in the way of the page
  await import("./assignment").then((m) => m.reassignUnreached(ctx)).catch((err) => console.error("Reassign check failed:", err.message))
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't add leads. Ask an administrator.",
  edit: "Your role can't change leads. Ask an administrator.",
  delete: "Your role can't delete leads. Ask an administrator.",
}

export async function crmAction(action) {
  const ctx = await crmContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  return { ctx }
}

// Limit a leads query to what this person may see. alias: the leads table's name in the query.
export function scoped(ctx, query, alias = "leads") {
  if (ctx.scope === "all") return query
  if (ctx.scope === "team" && ctx.myTeams.length) return query.where((q) => q.where(`${alias}.assignedTo`, ctx.user.id).orWhereIn(`${alias}.teamId`, ctx.myTeams))
  return query.where(`${alias}.assignedTo`, ctx.user.id)
}
