import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"

// Who's asking and what their role lets them do in HR & Payroll.
//   view / create / edit / delete / approve / export
//   scope own | team | all: whose employee records they see (their own / their teams' / everyone's)
//   grant(key): hr.salaries (see pay), hr.approve-leave, hr.roster (posts, duties, attendance),
//               hr.payroll (build and approve payroll runs), hr.loans (give loans and advances)
//   me: their own employee record, when they have one
export const hrContext = cache(async (path = "/hrm") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, member, teams, me] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "hr" }).first("a.id", "ta.offFeatures"),
    live(db, "members").where({ userId: s.user.id }).first("teamId"),
    live(db, "teams").select("id", "leadUserId"),
    live(db, "employees").where({ userId: s.user.id }).first("id", "code", "teamId"),
  ])
  const permissions = role?.permissions ?? []
  const { scope, grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  const myTeams = [...new Set([member?.teamId, me?.teamId, ...teams.filter((t) => t.leadUserId === s.user.id).map((t) => t.id)].filter(Boolean))]
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    scope: scope.hr ?? "own",
    myTeams,
    me: me ?? null,
    grant: (key) => grants[key],
    has: (feature) => Boolean(subscribed) && !cleanOff("hr", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "hr", action),
  }
})

export async function hrPage(path, feature = null) {
  const ctx = await hrContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  view: "Your role can't open HR & Payroll. Ask an administrator.",
  create: "Your role can't add HR records. Ask an administrator.",
  edit: "Your role can't change HR records. Ask an administrator.",
}
const GRANT_NEEDED = {
  "hr.salaries": "Your role can't see or change salaries. Ask an administrator.",
  "hr.approve-leave": "Your role can't approve leave. Ask an administrator.",
  "hr.roster": "Your role can't manage the roster or attendance. Ask an administrator.",
  "hr.payroll": "Your role can't run payroll. Ask an administrator.",
  "hr.loans": "Your role can't give loans or advances. Ask an administrator.",
}

// action: an hr permission; grant: an hr.* grant it also needs
export async function hrAction(action, grant = null) {
  const ctx = await hrContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  if (grant && !ctx.grant(grant)) return { error: GRANT_NEEDED[grant] ?? "Your role doesn't allow this." }
  return { ctx }
}

// Limit an employees query to the records this person may see
export function scoped(ctx, query, alias = "employees") {
  if (ctx.scope === "all") return query
  return query.where((q) => {
    q.where(`${alias}.userId`, ctx.user.id)
    if (ctx.scope === "team" && ctx.myTeams.length) q.orWhereIn(`${alias}.teamId`, ctx.myTeams)
  })
}

// Pay is shown to people with hr.salaries, and to everyone for their own record
export const seesPay = (ctx, employee) => Boolean(ctx.grant("hr.salaries")) || (employee?.userId != null && employee.userId === ctx.user.id)

export const HR_LISTS = ["leave-type", "employment-type", "post-kind", "designation", "department", "payment-method"]
export const hrLists = (ctx) => getLookups(ctx.db, HR_LISTS)
