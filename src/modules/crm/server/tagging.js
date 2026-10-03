import "server-only"
import { live } from "@/server/db/records"
import { can, isFullAccess } from "@/modules/users/permissions"
import { listMembers } from "@/modules/users/server/queries"

// Who may tag people on a lead, and whom (see lead_tags). ctx: crmContext()
export const isManager = (ctx) => ctx.canReassign || ctx.scope === "all"
export const canTagLead = (ctx, lead) => ctx.can("edit") && !lead.archivedAt && (isManager(ctx) || lead.assignedTo === ctx.user.id)

export async function taggable(ctx, lead) {
  const [members, roles] = await Promise.all([listMembers(ctx), live(ctx.db, "roles").select("id", "permissions")])
  const perms = new Map(roles.map((r) => [r.id, typeof r.permissions === "string" ? JSON.parse(r.permissions) : (r.permissions ?? [])]))
  const team = lead.assignedTo ? members.find((m) => m.id === lead.assignedTo)?.teamId : null
  return members.filter((m) => {
    if (m.status !== "active" || m.dealerId || m.id === lead.assignedTo) return false
    const p = perms.get(m.roleId) ?? []
    if (!isFullAccess(p) && !can(p, "crm", "view")) return false
    return isManager(ctx) || (team && m.teamId === team)
  })
}
