import "server-only"
import { cache } from "react"
import { notFound } from "next/navigation"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, roleAccess } from "@/modules/users/permissions"
import { cleanOff } from "@/modules/portal/features"
import { getLookups } from "@/modules/lookups/server"
import { maskCnic } from "@/lib/cnic"

// Who's asking and what their role lets them do in Contacts.
//   view / create / edit / delete / export
//   scope linked | all: contacts behind the leads and bookings they work on (and ones they added),
//                       or everyone
//   grant("contacts.cnic"): full CNIC numbers (otherwise 35202-•••••••-1)
export const contactsContext = cache(async (path = "/contacts") => {
  const s = await requireTenant(path)
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const [role, subscribed] = await Promise.all([
    live(db, "roles").where({ id: s.membership.roleId }).first("permissions", "scope", "grants"),
    platformDb()("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where({ "ta.tenantId": s.tenant.id, "a.code": "contacts" }).first("a.id", "ta.offFeatures"),
  ])
  const permissions = role?.permissions ?? []
  const { scope, grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  return {
    session: s,
    user: s.user,
    tenant: s.tenant,
    db,
    permissions,
    scope: scope.contacts ?? "linked",
    grant: (key) => grants[key],
    cnic: (value) => maskCnic(value, Boolean(grants["contacts.cnic"])),
    has: (feature) => Boolean(subscribed) && !cleanOff("contacts", subscribed?.offFeatures).includes(feature),
    can: (action) => Boolean(subscribed) && can(permissions, "contacts", action),
  }
})

export async function contactsPage(path, feature = null) {
  const ctx = await contactsContext(path)
  if (!ctx.can("view") || (feature && !ctx.has(feature))) notFound()
  return ctx
}

const NOT_ALLOWED = {
  create: "Your role can't add contacts. Ask an administrator.",
  edit: "Your role can't change contacts. Ask an administrator.",
  delete: "Your role can't delete contacts. Ask an administrator.",
  export: "Your role can't export contacts. Ask an administrator.",
}

export async function contactsAction(action) {
  const ctx = await contactsContext()
  if (!ctx.can(action)) return { error: NOT_ALLOWED[action] ?? "Your role doesn't allow this." }
  return { ctx }
}

// Limit a contacts query to what this person may see. "linked": contacts on leads assigned to
// them, on bookings they sold or handle, or that they added.
export function scoped(ctx, query, alias = "contacts") {
  if (ctx.scope === "all") return query
  const me = ctx.user.id
  return query.where((q) => {
    q.where(`${alias}.createdBy`, me)
      .orWhereExists((t) =>
        t
          .select(ctx.db.raw("1"))
          .from("contactLinks as cl")
          .join("leads as ld", "ld.id", "cl.linkableId")
          .whereColumn("cl.contactId", `${alias}.id`)
          .where("cl.linkableType", "lead")
          .whereNull("cl.deletedAt")
          .where("ld.assignedTo", me),
      )
      .orWhereExists((t) =>
        t
          .select(ctx.db.raw("1"))
          .from("contactLinks as cl")
          .join("bookings as bk", "bk.id", "cl.linkableId")
          .whereColumn("cl.contactId", `${alias}.id`)
          .where("cl.linkableType", "booking")
          .whereNull("cl.deletedAt")
          .where((w) => w.where("bk.agentId", me).orWhere("bk.soldBy", me)),
      )
  })
}

export const CONTACT_LISTS = ["contact-type", "city"]
export const contactLists = (ctx) => getLookups(ctx.db, CONTACT_LISTS)
