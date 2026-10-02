"use server"

import { z } from "zod"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { hashToken, newToken } from "@/server/auth/secrets"
import { sendEmail } from "@/server/mail/send"
import { siteUrl } from "@/lib/sites"
import { INVITABLE_ROLES, can, roleLabel } from "@/modules/console/roles"
import { logAudit } from "./audit"

// Console team: invite people with a role, change roles, remove and restore access.
// Only a role that manages "team" (the owner) may do any of this.

const INVITE_DAYS = 7

async function requireTeamManager() {
  const staff = await requireStaff("/team")
  if (!can(staff.role, "team")) return { staff, error: "Only the platform owner can manage the team." }
  return { staff }
}

const emailInvite = ({ to, name, role, inviter, link }) => sendEmail("team-invite", { to, data: { name, inviter, role: roleLabel(role), link, days: INVITE_DAYS } })

// New token for an invitation row; returns the link (only ever shown once)
async function issueToken(db, id) {
  const token = newToken()
  await db("invitations")
    .where({ id })
    .update({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), updatedAt: new Date() })
  return siteUrl("auth", `/invite/${token}`)
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(INVITABLE_ROLES, { message: "Pick a role." }),
})

// Returns { ok, link, emailed, emailError } or { error, fieldErrors }
export async function inviteMember(input) {
  const { staff, error } = await requireTeamManager()
  if (error) return { error }
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const { name, email, role } = parsed.data

  // Already on the team?
  const user = await live(authDb(), "users").where({ email }).first("id")
  if (user) {
    const member = await live(platformDb(), "platformStaff").where({ userId: user.id }).first("isActive")
    if (member) return { fieldErrors: { email: member.isActive ? "They're already on the team." : "They're on the team with access removed. Restore their access instead." } }
  }

  const db = authDb()
  // A new invitation replaces any earlier one still waiting for this email
  await db("invitations").where({ kind: "console", email }).whereNull("acceptedAt").whereNull("revokedAt").update({ revokedAt: new Date() })
  const [id] = await db("invitations").insert({
    kind: "console",
    email,
    name,
    consoleRole: role,
    invitedBy: staff.user.id,
    tokenHash: hashToken(newToken()),
    expiresAt: new Date(),
    createdBy: staff.user.id,
  })
  const link = await issueToken(db, id)
  const mail = await emailInvite({ to: email, name, role, inviter: staff.user.name, link })
  await logAudit({ actorUserId: staff.user.id, action: "team.invited", subjectType: "invitation", subjectId: id, details: { summary: `${name} <${email}> as ${roleLabel(role)}`, email, role, emailed: mail.ok } })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

async function pendingInvite(id) {
  return live(authDb(), "invitations").where({ id, kind: "console" }).whereNull("acceptedAt").whereNull("revokedAt").first()
}

// send: false makes a fresh link to copy and share, without emailing it
export async function resendInvite(id, { send = true } = {}) {
  const { staff, error } = await requireTeamManager()
  if (error) return { error }
  const invite = await pendingInvite(Number(id))
  if (!invite) return { error: "That invitation was already used or cancelled." }
  // A fresh token: the old link stops working
  const link = await issueToken(authDb(), invite.id)
  if (!send) {
    await logAudit({ actorUserId: staff.user.id, action: "team.invite_link_copied", subjectType: "invitation", subjectId: invite.id, details: { summary: invite.email } })
    return { ok: true, link, copyOnly: true }
  }
  const mail = await emailInvite({ to: invite.email, name: invite.name, role: invite.consoleRole, inviter: staff.user.name, link })
  await logAudit({ actorUserId: staff.user.id, action: "team.invite_resent", subjectType: "invitation", subjectId: invite.id, details: { summary: invite.email, emailed: mail.ok } })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

export async function revokeInvite(id) {
  const { staff, error } = await requireTeamManager()
  if (error) return { error }
  const invite = await pendingInvite(Number(id))
  if (!invite) return { error: "That invitation was already used or cancelled." }
  await authDb()("invitations").where({ id: invite.id }).update({ revokedAt: new Date(), updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: "team.invite_revoked", subjectType: "invitation", subjectId: invite.id, details: { summary: invite.email } })
  return { ok: true }
}

// The member being changed: never yourself, never the owner
async function changeableMember(staff, userId) {
  if (userId === staff.user.id) return { error: "You can't change your own access." }
  const member = await live(platformDb(), "platformStaff").where({ userId }).first()
  if (!member) return { error: "They're not on the team." }
  if (member.role === "owner") return { error: "The platform owner's access can't be changed." }
  const person = await authDb()("users").where({ id: userId }).first("name", "email")
  return { member, person }
}

export async function changeRole(userId, role) {
  const { staff, error } = await requireTeamManager()
  if (error) return { error }
  if (!INVITABLE_ROLES.includes(role)) return { error: "Pick a role." }
  const target = await changeableMember(staff, Number(userId))
  if (target.error) return target
  if (target.member.role === role) return { ok: true }
  await platformDb()("platformStaff").where({ id: target.member.id }).update({ role, updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({
    actorUserId: staff.user.id,
    action: "team.role_changed",
    subjectType: "user",
    subjectId: Number(userId),
    details: { summary: `${target.person.name}: ${roleLabel(target.member.role)} → ${roleLabel(role)}`, before: target.member.role, after: role },
  })
  return { ok: true }
}

// Remove or restore console access. Removing signs them out of the console at once.
export async function setMemberActive(userId, active) {
  const { staff, error } = await requireTeamManager()
  if (error) return { error }
  const target = await changeableMember(staff, Number(userId))
  if (target.error) return target
  await platformDb()("platformStaff")
    .where({ id: target.member.id })
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: staff.user.id })
  if (!active) {
    await authDb()("sessions")
      .where({ userId: Number(userId), kind: "console" })
      .whereNull("revokedAt")
      .update({ revokedAt: new Date() })
  }
  await logAudit({ actorUserId: staff.user.id, action: active ? "team.reactivated" : "team.deactivated", subjectType: "user", subjectId: Number(userId), details: { summary: target.person.name } })
  return { ok: true }
}
