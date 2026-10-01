import "server-only"
import { cache } from "react"
import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { listMembers, listTeams } from "@/modules/users/server/queries"

// My Desk is everyone's own app: no permission needed beyond being in the workspace.
// me: the person as Users & Teams sees them (role, team, designation, code…); teams: the teams
// they're in or lead, with members.
export const deskContext = cache(async (path = "/desk") => {
  const session = await requireTenant(path)
  const db = tenantDb({ dbName: session.tenant.dbName, dbHost: session.tenant.dbHost })
  const ctx = { session, user: session.user, tenant: session.tenant, db }
  const members = await listMembers(ctx)
  const me = members.find((m) => m.id === session.user.id) ?? null
  const role = await live(db, "roles").where({ id: session.membership.roleId }).first("permissions")
  const allTeams = await listTeams(ctx, members)
  const teams = allTeams.filter((t) => t.leadId === session.user.id || t.members.some((m) => m.id === session.user.id))
  return { ...ctx, me, members, teams, teamsCount: allTeams.length, permissions: role?.permissions ?? [] }
})
