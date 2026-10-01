import "server-only"
import { getLookups } from "@/modules/lookups/server"
import { DEALER_ROLE, isFullAccess } from "../permissions"
import { listInvitations, listMembers, listRoles, listTeams, seatUsage } from "./queries"

// What the Users & Teams pages need, loaded together. Each page takes what it uses.

// Roles this person may give someone: never Owner or Dealer (dealer logins get it from Dealer
// Accounts), and no more access than they have
export function assignableRoles(ctx, roles) {
  return roles.filter((r) => r.code !== "owner" && r.code !== DEALER_ROLE && (ctx.fullAccess || (!isFullAccess(r.permissions) && r.permissions.every((p) => ctx.permissions.includes(p)))))
}

export async function loadPeople(ctx) {
  const [members, invites, lists] = await Promise.all([listMembers(ctx), listInvitations(ctx), getLookups(ctx.db, ["designation", "department", "member-status", "city"])])
  const [roles, teams, seats] = await Promise.all([listRoles(ctx, members), listTeams(ctx, members), seatUsage(ctx, { members, invites })])
  return {
    members,
    invites,
    roles,
    teams,
    lists,
    seats,
    // For the invite dialog and member forms
    options: {
      roles: assignableRoles(ctx, roles).map((r) => ({ id: r.id, code: r.code, name: r.name })),
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      lists: { designation: lists.designation, department: lists.department },
      seats,
      // May add new designations / departments straight from the form
      canAddLists: ctx.can("edit") || ctx.can("create"),
    },
    // What this person may do here
    allowed: { invite: ctx.can("create"), edit: ctx.can("edit"), remove: ctx.can("delete"), roles: ctx.fullAccess },
  }
}
