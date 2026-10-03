import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"

// Who's asking and what their role lets them do in Finance. One set of books, so no scope.
//   view / create / edit / delete / approve / export
//   approve: posts vouchers and payments directly (without it they wait in Approvals) and decides
//            others' requests
//   grant(key): finance.cheques, finance.refunds, finance.void
export const financeContext = cache(async (path = "/finance") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "finance" }).first("a.id", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  const { grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    grant: (key) => grants[key],
    has: (feature) => Boolean(subscribed) && !cleanOff("finance", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "finance", action),
  }
})

export async function financePage(path, feature = null) {
  const ctx = await financeContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  view: "Your role can't open Finance. Ask an administrator.",
  create: "Your role can't enter vouchers or payments. Ask an administrator.",
  edit: "Your role can't change Finance records. Ask an administrator.",
  approve: "Your role can't approve Finance requests. Ask an administrator.",
}
const GRANT_NEEDED = {
  "finance.cheques": "Your role can't clear or bounce cheques. Ask an administrator.",
  "finance.refunds": "Your role can't pay refunds. Ask an administrator.",
  "finance.void": "Your role can't void vouchers. Ask an administrator.",
}

// action: a finance permission; grant: a finance.* grant it also needs
export async function financeAction(action, grant = null) {
  const ctx = await financeContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  if (grant && !ctx.grant(grant)) return { error: GRANT_NEEDED[grant] ?? "Your role doesn't allow this." }
  return { ctx }
}

export const FINANCE_LISTS = ["payment-method", "vendor-category", "booking-status"]
export const financeLists = (ctx) => getLookups(ctx.db, FINANCE_LISTS)
