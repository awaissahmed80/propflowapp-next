import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"

// Who's asking and what their role lets them do in Campaigns (view / create / edit / delete /
// approve / export). Campaigns has no scope: everyone with the app sees every campaign; the leads
// inside follow their CRM reach.
export const campaignsContext = cache(async (path = "/campaigns") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "campaigns" }).first("a.id", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    has: (feature) => Boolean(subscribed) && !cleanOff("campaigns", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "campaigns", action),
  }
})

export async function campaignsPage(path, feature = null) {
  const ctx = await campaignsContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't add campaigns, forms or pages. Ask an administrator.",
  edit: "Your role can't change campaigns, forms or pages. Ask an administrator.",
  delete: "Your role can't delete campaigns, forms or pages. Ask an administrator.",
}

export async function campaignsAction(action) {
  const ctx = await campaignsContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  return { ctx }
}

// Pick-lists Campaigns screens use
export const CAMPAIGN_LISTS = ["campaign-status", "campaign-objective", "lead-source", "lead-status", "city", "unit-type", "area-unit", "booking-stage"]
export const campaignLists = (ctx) => getLookups(ctx.db, CAMPAIGN_LISTS)
