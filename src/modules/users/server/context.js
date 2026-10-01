import "server-only"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, isFullAccess } from "../permissions"
import { cleanOff } from "@/modules/portal/features"

// Who's asking, in which workspace, and what their role lets them do in Users & Teams.
// Pages call usersPage(); server actions call usersAction(action) and return its error.
//   view    see people, teams, invitations, roles and the activity log
//   create  invite people
//   edit    change people's role, team and status; edit teams and roles
//   delete  remove people, delete teams and roles

export const usersContext = cache(async (path = "/users") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("id", "code", "name", "permissions"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "users" }).first("a.id", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    role,
    permissions,
    fullAccess: isFullAccess(permissions),
    isOwner: role?.code === "owner",
    subscribed: Boolean(subscribed),
    // Features of this app the workspace has (portal/features.js); off ones are switched off by plan or package
    has: (feature) => Boolean(subscribed) && !cleanOff("users", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "users", action),
  }
})

// For pages: the context, or a 404 for anyone whose role can't open Users & Teams
// feature: a part of Users & Teams the page belongs to (e.g. "dealers"); 404 without it
export async function usersPage(path, feature = null) {
  const ctx = await usersContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't invite people. Ask an administrator.",
  edit: "Your role can't change people, teams or roles. Ask an administrator.",
  delete: "Your role can't remove people or delete teams and roles. Ask an administrator.",
}

// For server actions: { ctx } or { error }
export async function usersAction(action, feature = null) {
  const ctx = await usersContext()
  if (feature && !ctx.has(feature)) return { error: "This part of Users & Teams isn't in your plan. Ask PropFlow to add it." }
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  return { ctx }
}

// The workspace has to have finished setting up before its apps open
export async function requireSetupDone(ctx) {
  const row = await ctx.db("settings").where({ key: "setup_completed_at" }).first("value")
  if (!row?.value) redirect("/setup")
}
