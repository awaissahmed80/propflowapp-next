"use server"

import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashToken, newToken } from "@/server/auth/secrets"
import { sendEmail } from "@/server/mail/send"
import { logActivity } from "@/server/tenants/activity"
import { siteUrl } from "@/lib/sites"
import { normalizePkMobile } from "@/lib/phone"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { DEALER_ROLE, isFullAccess } from "../permissions"
import { usersAction } from "./context"
import { saveProfile } from "./profile"
import { INVITE_DAYS, getMember, listInvitations, listMembers, seatUsage } from "./queries"

// People in the workspace: invite, change role / team / designation, suspend, remove.
// Nobody can give anyone more access than they have themselves, the owner's access can't be
// changed by anyone else, and nobody changes their own role or status.

const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))
const optionalId = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable())
const optionalText = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().max(60).nullable())

// The role being given: must exist, never Owner, the Dealer role only for dealer logins, and
// full access only from someone who has it
async function assignableRole(ctx, roleId, { dealer = false } = {}) {
  const role = await live(ctx.db, "roles").where({ id: roleId }).first("id", "code", "name", "permissions")
  if (!role) return { error: "Pick a role." }
  if (role.code === "owner") return { error: "There can only be one owner." }
  if (role.code === DEALER_ROLE && !dealer) return { error: "The Dealer role is for dealer logins. Invite them from Dealer Accounts." }
  if (isFullAccess(role.permissions) && !ctx.fullAccess) return { error: `Only someone with full access can give the ${role.name} role.` }
  if (!ctx.fullAccess && role.permissions.some((p) => !ctx.permissions.includes(p))) return { error: `The ${role.name} role has access you don't have, so you can't give it.` }
  return { role }
}

// Designation and department must be values in the workspace's lists (or what they already have)
async function checkProfile(ctx, { designation, department }, current = {}) {
  const lists = await getLookups(ctx.db, ["designation", "department"])
  const errors = {}
  if (designation && designation !== current.designation && !isLookupValue(lists.designation, designation)) errors.designation = "Pick a designation from the list."
  if (department && department !== current.department && !isLookupValue(lists.department, department)) errors.department = "Pick a department from the list."
  return errors
}

async function checkTeam(ctx, teamId) {
  if (!teamId) return null
  return (await live(ctx.db, "teams").where({ id: teamId }).first("id", "name")) ?? false
}

// ---------- invitations ----------

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  roleId: z.coerce.number({ message: "Pick a role." }).int().positive("Pick a role."),
  teamId: optionalId,
  designation: optionalText,
  department: optionalText,
  // A login for a dealer firm: always the Dealer role, no team, designation or department
  dealerId: optionalId,
})

const emailInvite = (ctx, { to, name, role, link }) => sendEmail("member-invite", { to, data: { name, inviter: ctx.user.name, workspace: ctx.tenant.name, role, link, days: INVITE_DAYS } })

// A fresh link for an invitation row (the old one stops working); returns the link
async function issueLink(id) {
  const token = newToken()
  await authDb()("invitations")
    .where({ id })
    .update({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), updatedAt: new Date() })
  return siteUrl("auth", `/invite/${token}`)
}

// Returns { ok, link, emailed, emailError } or { error, fieldErrors }
export async function inviteMember(input) {
  const { ctx, error } = await usersAction("create")
  if (error) return { error }
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const { name, email, dealerId } = parsed.data
  let { roleId, teamId, designation, department } = parsed.data

  let dealer = null
  if (dealerId) {
    dealer = await live(ctx.db, "dealers").where({ id: dealerId }).first("id", "name", "isActive")
    if (!dealer) return { error: "That dealer was removed." }
    if (!dealer.isActive) return { error: `${dealer.name} is inactive. Activate the dealer first.` }
    const role = await live(ctx.db, "roles").where({ code: DEALER_ROLE }).first("id")
    if (!role) return { error: "The Dealer role is missing. Ask PropFlow support." }
    ;[roleId, teamId, designation, department] = [role.id, null, null, null]
  }
  const assign = await assignableRole(ctx, roleId, { dealer: Boolean(dealer) })
  if (assign.error) return { fieldErrors: { roleId: assign.error } }
  const profileErrors = await checkProfile(ctx, { designation, department })
  if (Object.keys(profileErrors).length) return { fieldErrors: profileErrors }
  if ((await checkTeam(ctx, teamId)) === false) return { fieldErrors: { teamId: "That team no longer exists." } }

  const [members, invites] = await Promise.all([listMembers(ctx), listInvitations(ctx)])
  const existing = members.find((m) => m.email === email)
  if (existing) return { fieldErrors: { email: existing.status === "suspended" ? `${existing.name} is already here, suspended. Reactivate them instead.` : `${existing.name} is already in this workspace.` } }
  // A new invitation replaces one still waiting for the same email, so that one doesn't take a seat
  const others = invites.filter((i) => i.email !== email)
  const seats = await seatUsage(ctx, { members, invites: others })
  if (dealer) {
    if (seats.dealers.limit != null && seats.dealers.used >= seats.dealers.limit)
      return {
        error:
          seats.dealers.limit === 0
            ? `The ${seats.plan} plan doesn't include dealer logins. Upgrade to add them.`
            : `All ${seats.dealers.limit} dealer logins on the ${seats.plan} plan are in use. Upgrade, or remove one, to add more.`,
      }
  } else if (seats.limit && seats.used >= seats.limit) return { error: `All ${seats.limit} seats on the ${seats.plan} plan are in use. Upgrade, or remove someone, to invite more people.` }

  const db = authDb()
  await db("invitations").where({ kind: "tenant", tenantId: ctx.tenant.id, email }).whereNull("acceptedAt").whereNull("revokedAt").update({ revokedAt: new Date(), updatedAt: new Date(), updatedBy: ctx.user.id })
  const [id] = await db("invitations").insert({
    kind: "tenant",
    email,
    name,
    tenantId: ctx.tenant.id,
    roleId,
    details: JSON.stringify({ teamId, designation, department, dealerId: dealer?.id ?? null }),
    invitedBy: ctx.user.id,
    tokenHash: hashToken(newToken()),
    expiresAt: new Date(),
    createdBy: ctx.user.id,
  })
  const link = await issueLink(id)
  const mail = await emailInvite(ctx, { to: email, name, role: assign.role.name, link })
  await logActivity(ctx.db, {
    type: "invite",
    action: "invite.sent",
    actorUserId: ctx.user.id,
    summary: dealer ? `invited ${name} as a login for ${dealer.name}` : `invited ${name} as ${assign.role.name}`,
    subjectType: "invitation",
    subjectId: id,
    details: { email, roleId, emailed: mail.ok },
  })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

async function pendingInvite(ctx, id) {
  return live(authDb(), "invitations")
    .where({ id: Number(id), kind: "tenant", tenantId: ctx.tenant.id })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .first("id", "email", "name", "roleId")
}

// send: false makes a fresh link to copy and share, without emailing it
export async function resendInvitation(id, { send = true } = {}) {
  const { ctx, error } = await usersAction("create")
  if (error) return { error }
  const invite = await pendingInvite(ctx, id)
  if (!invite) return { error: "That invitation was already accepted or canceled." }
  const role = await live(ctx.db, "roles").where({ id: invite.roleId }).first("name")
  const link = await issueLink(invite.id)
  if (!send) {
    await logActivity(ctx.db, {
      type: "invite",
      action: "invite.link_copied",
      actorUserId: ctx.user.id,
      summary: `made a new invitation link for ${invite.name ?? invite.email}`,
      subjectType: "invitation",
      subjectId: invite.id,
    })
    return { ok: true, link, copyOnly: true }
  }
  const mail = await emailInvite(ctx, { to: invite.email, name: invite.name, role: role?.name ?? "a member", link })
  await logActivity(ctx.db, { type: "invite", action: "invite.resent", actorUserId: ctx.user.id, summary: `resent the invitation to ${invite.name ?? invite.email}`, subjectType: "invitation", subjectId: invite.id })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

export async function revokeInvitation(id) {
  const { ctx, error } = await usersAction("create")
  if (error) return { error }
  const invite = await pendingInvite(ctx, id)
  if (!invite) return { error: "That invitation was already accepted or canceled." }
  await authDb()("invitations").where({ id: invite.id }).update({ revokedAt: new Date(), updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "invite", action: "invite.revoked", actorUserId: ctx.user.id, summary: `canceled the invitation to ${invite.name ?? invite.email}`, subjectType: "invitation", subjectId: invite.id })
  return { ok: true }
}

// ---------- members ----------

// The person being changed, with what the actor may do to them
async function target(ctx, userId) {
  const member = await getMember(ctx, userId)
  if (!member) return { error: "They're not in this workspace any more." }
  if (member.isOwner && !ctx.isOwner) return { error: "Only the owner can change the owner's account." }
  return { member }
}

const updateSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  teamId: optionalId,
  designation: optionalText,
  department: optionalText,
})

// { roleId, teamId, designation, department } → { ok } or { error, fieldErrors }
export async function updateMember(userId, input) {
  const { ctx, error } = await usersAction("edit")
  if (error) return { error }
  const t = await target(ctx, userId)
  if (t.error) return t
  const m = t.member
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const next = parsed.data

  // Dealer logins keep the Dealer role and belong to their firm, not a team
  if (m.dealerId) {
    if (next.roleId !== m.roleId) return { fieldErrors: { roleId: `${m.name} is a login for ${m.dealer?.name ?? "a dealer"}, so keeps the Dealer role.` } }
    if (next.teamId) return { fieldErrors: { teamId: "Dealer logins aren't in teams." } }
  }

  const changes = []
  if (next.roleId !== m.roleId) {
    if (m.isOwner) return { fieldErrors: { roleId: "The owner always has full access." } }
    if (m.id === ctx.user.id) return { fieldErrors: { roleId: "You can't change your own role." } }
    const assign = await assignableRole(ctx, next.roleId)
    if (assign.error) return { fieldErrors: { roleId: assign.error } }
    // Taking someone's full access away also needs full access
    if (!ctx.fullAccess && ["owner", "admin"].includes(m.roleCode)) return { fieldErrors: { roleId: `Only someone with full access can change an ${m.role}'s role.` } }
    await authDb()("memberships").where({ id: m.membershipId }).update({ roleId: next.roleId, updatedAt: new Date(), updatedBy: ctx.user.id })
    changes.push(["role", "member.role_changed", `gave ${m.name} the ${assign.role.name} role`])
  }
  const profileErrors = await checkProfile(ctx, next, m)
  if (Object.keys(profileErrors).length) return { fieldErrors: profileErrors }
  const team = await checkTeam(ctx, next.teamId)
  if (team === false) return { fieldErrors: { teamId: "That team no longer exists." } }

  if (next.teamId !== m.teamId || next.designation !== m.designation || next.department !== m.department) {
    await saveProfile(ctx.db, m.id, { teamId: next.teamId, designation: next.designation, department: next.department }, ctx.user.id)
    if (next.teamId !== m.teamId) {
      changes.push(["team", "member.team_changed", team ? `moved ${m.name} to ${team.name}` : `took ${m.name} out of ${m.team?.name ?? "their team"}`])
      // Someone who leaves a team stops leading it
      await ctx
        .db("teams")
        .where({ leadUserId: m.id })
        .whereNot({ id: next.teamId ?? 0 })
        .update({ leadUserId: null, updatedAt: new Date(), updatedBy: ctx.user.id })
    }
    if (next.designation !== m.designation || next.department !== m.department) changes.push(["role", "member.profile_changed", `updated ${m.name}'s designation and department`])
  }
  for (const [type, action, summary] of changes) await logActivity(ctx.db, { type, action, actorUserId: ctx.user.id, summary, subjectType: "user", subjectId: m.id })
  return { ok: true }
}

// Suspend (signs them out of this workspace at once) or reactivate
export async function setMemberStatus(userId, status) {
  const { ctx, error } = await usersAction("edit")
  if (error) return { error }
  if (!["active", "suspended"].includes(status)) return { error: "Unknown status." }
  const t = await target(ctx, userId)
  if (t.error) return t
  const m = t.member
  if (m.isOwner) return { error: "The owner can't be suspended." }
  if (status === "suspended" && m.roleCode === "admin") return { error: `An ${m.role} can't be suspended. Give them another role first.` }
  if (m.id === ctx.user.id) return { error: "You can't suspend yourself." }
  if (m.status === status) return { ok: true }
  if (status === "active") {
    const seats = await seatUsage(ctx)
    if (m.dealerId) {
      if (seats.dealers.limit != null && seats.dealers.used >= seats.dealers.limit) return { error: `All dealer logins on the ${seats.plan} plan are in use. Free one before reactivating ${m.name}.` }
      const firm = await live(ctx.db, "dealers").where({ id: m.dealerId }).first("isActive", "name")
      if (firm && !firm.isActive) return { error: `${firm.name} is inactive. Activate the dealer first.` }
    } else if (seats.limit && seats.used >= seats.limit) return { error: `All ${seats.limit} seats on the ${seats.plan} plan are in use. Free a seat before reactivating ${m.name}.` }
  }
  await authDb()("memberships").where({ id: m.membershipId }).update({ status, updatedAt: new Date(), updatedBy: ctx.user.id })
  if (status === "suspended") await endSessions(ctx, m.id)
  await logActivity(ctx.db, {
    type: "security",
    action: `member.${status === "suspended" ? "suspended" : "reactivated"}`,
    actorUserId: ctx.user.id,
    summary: `${status === "suspended" ? "suspended" : "reactivated"} ${m.name}`,
    subjectType: "user",
    subjectId: m.id,
  })
  return { ok: true }
}

const endSessions = (ctx, userId) => authDb()("sessions").where({ userId, tenantId: ctx.tenant.id, kind: "tenant" }).whereNull("revokedAt").update({ revokedAt: new Date() })

// Takes them out of the workspace. Their records keep their name; they can be invited again.
export async function removeMember(userId) {
  const { ctx, error } = await usersAction("delete")
  if (error) return { error }
  const t = await target(ctx, userId)
  if (t.error) return t
  const m = t.member
  if (m.isOwner) return { error: "The owner can't be removed." }
  if (m.id === ctx.user.id) return { error: "You can't remove yourself." }
  if (!ctx.fullAccess && ["admin"].includes(m.roleCode)) return { error: `Only someone with full access can remove an ${m.role}.` }
  const now = new Date()
  await authDb()("memberships").where({ id: m.membershipId }).update({ deletedAt: now, deletedBy: ctx.user.id, isDefault: false, updatedAt: now })
  await endSessions(ctx, m.id)
  await ctx.db("members").where({ userId: m.id }).whereNull("deletedAt").update({ deletedAt: now, deletedBy: ctx.user.id })
  await ctx.db("teams").where({ leadUserId: m.id }).update({ leadUserId: null, updatedAt: now, updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "security", action: "member.removed", actorUserId: ctx.user.id, summary: `removed ${m.name} from the workspace`, subjectType: "user", subjectId: m.id })
  return { ok: true }
}

// Mobile number on their PropFlow account (the same account in every workspace they belong to).
// Anyone who can edit people may change it, and everyone may change their own. "" clears it.
export async function updateMemberPhone(userId, input) {
  const self = (await usersAction("view")).ctx
  const isSelf = self && Number(userId) === self.user.id
  const { ctx, error } = isSelf ? { ctx: self } : await usersAction("edit")
  if (error) return { error }
  const t = await target(ctx, userId)
  if (t.error) return t
  const m = t.member
  const raw = String(input ?? "").trim()
  const phone = raw ? normalizePkMobile(raw) : null
  if (raw && !phone) return { error: "Enter a Pakistani mobile number, e.g. 0300 1234567." }
  if ((m.phone ?? null) === phone) return { ok: true }
  await authDb()("users").where({ id: m.id }).update({ phone, phoneVerifiedAt: null, updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, {
    type: "security",
    action: "member.phone_changed",
    actorUserId: ctx.user.id,
    summary: isSelf ? "changed their mobile number" : `changed ${m.name}'s mobile number`,
    subjectType: "user",
    subjectId: m.id,
  })
  return { ok: true }
}
