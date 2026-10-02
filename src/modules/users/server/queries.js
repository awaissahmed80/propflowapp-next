import "server-only"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { ensureProfiles } from "./profile"

// Reads for Users & Teams. People and their role live in pf_auth (users, memberships); their
// team, designation and department in the workspace's members table.

export const INVITE_DAYS = 7
const DAY = 86_400_000

// id → { id, name, email, avatarUrl } for pf_auth users
export async function peopleByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await authDb()("users").whereIn("id", unique).select("id", "name", "email", "avatarUrl")
  return new Map(rows.map((r) => [r.id, r]))
}

const teamRef = (t) => (t ? { id: t.id, name: t.name, color: t.color } : null)

// Everyone in the workspace (active and suspended), with role, team and when last seen
export async function listMembers(ctx) {
  const rows = await authDb()("memberships as m")
    .join("users as u", "u.id", "m.userId")
    .where("m.tenantId", ctx.tenant.id)
    .whereIn("m.status", ["active", "suspended"])
    .whereNull("m.deletedAt")
    .whereNull("u.deletedAt")
    .orderBy("u.name")
    .select("u.id", "u.name", "u.email", "u.phone", "u.avatarUrl", "u.lastLoginAt", "m.id as membershipId", "m.roleId", "m.status", "m.joinedAt", "m.createdAt")
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  // Everyone needs a profile (and its code) before they can have a page
  await ensureProfiles(ctx.db, ids, Object.fromEntries(rows.map((r) => [r.id, r.joinedAt ?? r.createdAt])))
  const [profiles, roles, teams, seen] = await Promise.all([
    live(ctx.db, "members").whereIn("userId", ids).select("userId", "code", "teamId", "dealerId", "designation", "department", "joinedAt"),
    live(ctx.db, "roles").select("id", "code", "name"),
    live(ctx.db, "teams").select("id", "name", "color"),
    authDb()("sessions").where({ tenantId: ctx.tenant.id, kind: "tenant" }).whereIn("userId", ids).groupBy("userId").select("userId").max({ lastSeenAt: "lastSeenAt" }),
  ])
  const dealerIds = [...new Set(profiles.map((p) => p.dealerId).filter(Boolean))]
  const dealers = dealerIds.length ? await ctx.db("dealers").whereIn("id", dealerIds).select("id", "code", "name") : []
  const dealerOf = new Map(dealers.map((d) => [d.id, d]))
  const profileOf = new Map(profiles.map((p) => [p.userId, p]))
  const roleOf = new Map(roles.map((r) => [r.id, r]))
  const teamOf = new Map(teams.map((t) => [t.id, t]))
  const seenOf = new Map(seen.map((s) => [s.userId, s.lastSeenAt]))
  return rows.map((r) => {
    const p = profileOf.get(r.id) ?? {}
    const role = roleOf.get(r.roleId)
    return {
      id: r.id,
      code: p.code,
      membershipId: r.membershipId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      avatarUrl: r.avatarUrl,
      roleId: r.roleId,
      role: role?.name ?? "No role",
      roleCode: role?.code ?? null,
      isOwner: role?.code === "owner",
      status: r.status,
      teamId: p.teamId ?? null,
      team: teamRef(teamOf.get(p.teamId)),
      // Dealer logins belong to a dealer firm instead of a team
      dealerId: p.dealerId ?? null,
      dealer: dealerOf.get(p.dealerId) ?? null,
      designation: p.designation ?? null,
      department: p.department ?? null,
      joinedAt: p.joinedAt ?? r.joinedAt ?? r.createdAt,
      lastActiveAt: seenOf.get(r.id) ?? r.lastLoginAt ?? null,
    }
  })
}

export async function getMember(ctx, userId) {
  const members = await listMembers(ctx)
  return members.find((m) => m.id === Number(userId)) ?? null
}

// By the member code in the URL (MEM-00001)
export async function getMemberByCode(ctx, code) {
  const members = await listMembers(ctx)
  return members.find((m) => m.code === String(code).toUpperCase()) ?? null
}

// Invitations still waiting (including expired ones, which can be resent)
export async function listInvitations(ctx) {
  const rows = await live(authDb(), "invitations")
    .where({ kind: "tenant", tenantId: ctx.tenant.id })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .orderBy("updatedAt", "desc")
    .orderBy("id", "desc")
    .select("id", "email", "name", "roleId", "details", "invitedBy", "expiresAt", "createdAt", "updatedAt")
  if (!rows.length) return []
  const [roles, teams, dealers, inviters] = await Promise.all([
    live(ctx.db, "roles").select("id", "name"),
    live(ctx.db, "teams").select("id", "name", "color"),
    ctx.db("dealers").select("id", "code", "name"),
    peopleByIds(rows.map((r) => r.invitedBy)),
  ])
  const now = Date.now()
  return rows.map((r) => {
    const details = r.details ?? {}
    return {
      id: r.id,
      email: r.email,
      name: r.name ?? r.email,
      roleId: r.roleId,
      role: roles.find((x) => x.id === r.roleId)?.name ?? "No role",
      teamId: details.teamId ?? null,
      team: teamRef(teams.find((t) => t.id === details.teamId)),
      dealerId: details.dealerId ?? null,
      dealer: dealers.find((d) => d.id === details.dealerId) ?? null,
      designation: details.designation ?? null,
      department: details.department ?? null,
      invitedBy: inviters.get(r.invitedBy)?.name ?? "Someone",
      // Sent (or last resent) when the current link was issued
      sentAt: new Date(r.expiresAt.getTime() - INVITE_DAYS * DAY),
      expiresAt: r.expiresAt,
      expired: r.expiresAt.getTime() < now,
    }
  })
}

// Seats the plan includes (null: unlimited). User seats: people who aren't suspended plus live
// invitations, leaving out dealer logins. Dealer seats (the plan's "Dealers" limit): dealer
// logins who aren't suspended plus live dealer invitations.
export async function seatUsage(ctx, { members, invites } = {}) {
  const [plan, people, waiting] = await Promise.all([platformDb()("plans").where({ id: ctx.tenant.planId }).first("name", "maxUsers", "maxDealers"), members ?? listMembers(ctx), invites ?? listInvitations(ctx)])
  const count = (dealer) => people.filter((m) => m.status !== "suspended" && Boolean(m.dealerId) === dealer).length + waiting.filter((i) => !i.expired && Boolean(i.dealerId) === dealer).length
  return {
    plan: plan?.name ?? null,
    used: count(false),
    limit: plan?.maxUsers ?? null,
    dealers: { used: count(true), limit: plan?.maxDealers ?? null },
  }
}

// Dealer firms with their logins and waiting invitations
export async function listDealers(ctx, members, invites) {
  const rows = await live(ctx.db, "dealers").orderBy("name").select("id", "code", "name", "contactName", "phone", "email", "city", "address", "ntn", "notes", "isActive")
  // Inventory allocated to each dealer's quota (Estate Management)
  const quota = await live(ctx.db, "units").whereNotNull("dealerId").groupBy("dealerId", "status").select("dealerId", "status").count({ n: "id" })
  const quotaOf = (id) => {
    const mine = quota.filter((q) => q.dealerId === id)
    return { total: mine.reduce((t, q) => t + Number(q.n), 0), available: Number(mine.find((q) => q.status === "available")?.n ?? 0) }
  }
  return rows.map((d) => ({
    ...d,
    quota: quotaOf(d.id),
    logins: members.filter((m) => m.dealerId === d.id),
    invites: invites.filter((i) => i.dealerId === d.id),
  }))
}

// Teams with their lead and members. Bookings achieved come with the Sales app.
export async function listTeams(ctx, members) {
  const rows = await live(ctx.db, "teams").orderBy("sortOrder").orderBy("name").select("id", "name", "color", "description", "leadUserId", "targetBookings", "targetValue", "projectIds")
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    description: t.description,
    leadId: t.leadUserId,
    lead: members.find((m) => m.id === t.leadUserId) ?? null,
    members: members.filter((m) => m.teamId === t.id),
    target: { bookings: t.targetBookings, value: Number(t.targetValue) },
    achieved: { bookings: 0, value: 0 },
    projectIds: t.projectIds ?? [],
  }))
}

// Roles with how many people have each
export async function listRoles(ctx, members) {
  const rows = await live(ctx.db, "roles").orderBy("sortOrder").orderBy("name").select("id", "code", "name", "description", "permissions", "scope", "grants", "isSystem")
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    permissions: r.permissions ?? [],
    scope: r.scope ?? {},
    grants: r.grants ?? {},
    system: r.isSystem,
    memberCount: members.filter((m) => m.roleId === r.id).length,
  }))
}

// Activity, newest first, with who did it. Optional: about or by one person.
export async function listActivity(ctx, { limit = 500, userId } = {}) {
  let q = ctx.db("activityLog").orderBy("createdAt", "desc").orderBy("id", "desc").limit(limit)
  if (userId) q = q.where((w) => w.where({ actorUserId: userId }).orWhere({ subjectType: "user", subjectId: userId }))
  const rows = await q.select("id", "type", "action", "actorUserId", "summary", "subjectType", "subjectId", "createdAt")
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))]
  const [people, profiles] = await Promise.all([peopleByIds(actorIds), actorIds.length ? ctx.db("members").whereIn("userId", actorIds).select("userId", "code") : []])
  const codeOf = new Map(profiles.map((p) => [p.userId, p.code]))
  return rows.map((r) => {
    const person = people.get(r.actorUserId)
    return { ...r, actor: person ? { ...person, code: codeOf.get(r.actorUserId) ?? null } : null }
  })
}

// Apps the workspace subscribes to, in launcher order (for the permission matrix)
export async function workspaceApps(ctx) {
  return platformDb()("tenantApps as ta")
    .join("apps as a", "a.id", "ta.appId")
    .where("ta.tenantId", ctx.tenant.id)
    .whereNull("a.deletedAt")
    .where("a.isActive", true)
    .orderBy("a.sortOrder")
    .select("a.code", "a.name", "a.icon", "a.color", "a.alwaysOn")
}
