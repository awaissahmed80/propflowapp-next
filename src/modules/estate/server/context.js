import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"

// Who's asking and what their role lets them do in Estate Management.
//   view / create / edit / approve / export · scope own | team | all (requests assigned to them,
//   their teams', or everyone's) · grant(key): services.assign, services.ndc, services.transfer,
//   services.possession, services.waive
export const servicesContext = cache(async (path = "/estate-management") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, me, teams] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "estate" }).first("a.id", "ta.offFeatures"),
    live(db, "members").where({ userId: s.user.id }).first("teamId"),
    live(db, "teams").select("id", "leadUserId"),
  ])
  const permissions = role?.permissions ?? []
  const { scope, grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  const myTeams = [...new Set([me?.teamId, ...teams.filter((t) => t.leadUserId === s.user.id).map((t) => t.id)].filter(Boolean))]
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    scope: scope.estate ?? "own",
    myTeams,
    grant: (key) => grants[key],
    has: (feature) => Boolean(subscribed) && !cleanOff("estate", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "estate", action),
  }
})

export async function servicesPage(path, feature = null) {
  const ctx = await servicesContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't log service requests. Ask an administrator.",
  edit: "Your role can't work on service requests. Ask an administrator.",
}
const GRANT_NEEDED = {
  "estate.assign": "Your role can't give requests to other people.",
  "estate.ndc": "Your role can't issue NDCs.",
  "estate.transfer": "Your role can't complete transfers. Send it for approval instead.",
  "estate.possession": "Your role can't hand over possession.",
  "estate.waive": "Your role can't waive fees.",
}

// action: a services permission; grant: a services.* grant it also needs
export async function servicesAction(action, grant = null) {
  const ctx = await servicesContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  if (grant && !ctx.grant(grant)) return { error: GRANT_NEEDED[grant] ?? "Your role doesn't allow this." }
  return { ctx }
}

// Limit a requests query to what this person may see (by who it's assigned to; unassigned
// requests show to everyone who can work them)
export function scoped(ctx, query, alias = "serviceRequests") {
  if (ctx.scope === "all") return query
  return query.where((q) => {
    q.where(`${alias}.assignedTo`, ctx.user.id).orWhereNull(`${alias}.assignedTo`)
    if (ctx.scope === "team" && ctx.myTeams.length) q.orWhereIn(`${alias}.assignedTo`, ctx.db("members").whereIn("teamId", ctx.myTeams).whereNull("deletedAt").select("userId"))
  })
}

export const SERVICE_LISTS = [
  "service-request-type",
  "service-status",
  "service-priority",
  "complaint-category",
  "service-document",
  "service-channel",
  "payment-method",
  "unit-type",
  "area-unit",
  "booking-stage",
  "booking-status",
]
export const serviceLists = (ctx) => getLookups(ctx.db, SERVICE_LISTS)
