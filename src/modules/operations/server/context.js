import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"

// Who's asking and what their role lets them do in Sales.
//   view / create / edit / delete / approve / export   the usual actions
//   scope  own | team | all   which bookings they see (theirs as agent / their teams' / everyone's)
//   grant(key)   sales.discount (% on top of the plan), sales.receipts, sales.cheques, sales.allot,
//                sales.cancel, sales.commissions (none | own | all), sales.pay-commissions
export const salesContext = cache(async (path = "/operations") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, me, teams] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "operations" }).first("a.id", "ta.offFeatures"),
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
    scope: scope.operations ?? "own",
    myTeams,
    grant: (key) => grants[key],
    has: (feature) => Boolean(subscribed) && !cleanOff("operations", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "operations", action),
  }
})

export async function salesPage(path, feature = null) {
  const ctx = await salesContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't make bookings. Ask an administrator.",
  edit: "Your role can't change bookings. Ask an administrator.",
}

// action: a sales permission; grant: a sales.* grant it also needs (receipts, cheques…)
export async function salesAction(action, grant = null) {
  const ctx = await salesContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  if (grant && !ctx.grant(grant)) return { error: GRANT_NEEDED[grant] ?? "Your role doesn't allow this." }
  return { ctx }
}
const GRANT_NEEDED = {
  "operations.receipts": "Your role can't record payments. Ask an administrator.",
  "operations.cheques": "Your role can't clear or bounce cheques. Ask an administrator.",
  "operations.allot": "Your role can't issue allotment letters. Ask an administrator.",
  "operations.cancel": "Your role can't cancel bookings. Ask an administrator.",
}

// Limit a bookings query to what this person may see: bookings they (or their teams) handle,
// and ones they sold, which stay visible after Assignment rules hand them on
export function scoped(ctx, query, alias = "bookings") {
  if (ctx.scope === "all") return query
  return query.where((q) => {
    q.where(`${alias}.agentId`, ctx.user.id).orWhere(`${alias}.soldBy`, ctx.user.id)
    if (ctx.scope === "team" && ctx.myTeams.length) q.orWhereIn(`${alias}.agentId`, ctx.db("members").whereIn("teamId", ctx.myTeams).whereNull("deletedAt").select("userId"))
  })
}

// May this person work the booking (payments, plan, stages…), not just see it? Everyone with
// "all" scope, its handler, and their team when the scope is "team". The seller alone sees it,
// adds notes and files, and uploads documents until the allotment letter.
export async function handles(ctx, booking) {
  if (ctx.scope === "all" || booking.agentId === ctx.user.id) return true
  if (ctx.scope !== "team" || !ctx.myTeams.length || !booking.agentId) return false
  const m = await live(ctx.db, "members").where({ userId: booking.agentId }).whereIn("teamId", ctx.myTeams).first("id")
  return Boolean(m)
}
export const NOT_HANDLER = "Someone else handles this booking now. You can follow it, add notes and files."
