import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"
import { typeAccess } from "./access"

// Who's asking and what their role lets them do in Documents.
//   view / create / edit / delete / export; grant("documents.share") for share links
//   types: document-type values with their "who can see" rule · canSeeType(type)
//   canApp(app, action): their role in another app (for files other apps stored)
export const documentsContext = cache(async (path = "/documents") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed, lists] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("code", "permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "documents" }).first("a.id", "ta.offFeatures"),
    getLookups(db, ["document-type"]),
  ])
  const permissions = role?.permissions ?? []
  const { grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  const types = (lists["document-type"] ?? []).filter((t) => t.isActive)
  const access = typeAccess(role, types)
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    role,
    permissions,
    types,
    canSeeType: access.canSeeType,
    visibleTypes: access.visibleTypes,
    grant: (key) => grants[key],
    canApp: (app, action = "view") => can(permissions, app, action),
    has: (feature) => Boolean(subscribed) && !cleanOff("documents", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "documents", action),
  }
})

export async function documentsPage(path, feature = null) {
  const ctx = await documentsContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't upload documents. Ask an administrator.",
  edit: "Your role can't change documents. Ask an administrator.",
  delete: "Your role can't delete documents. Ask an administrator.",
}

export async function documentsAction(action, grant = null) {
  const ctx = await documentsContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  if (grant && !ctx.grant(grant)) return { error: "Your role can't share documents outside the workspace. Ask an administrator." }
  return { ctx }
}
