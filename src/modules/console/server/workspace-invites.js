"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { hashToken, newToken } from "@/server/auth/secrets"
import { sendEmail } from "@/server/mail/send"
import { siteUrl } from "@/lib/sites"
import { can } from "@/modules/console/roles"
import { logAudit } from "./audit"
import { cleanOff } from "@/modules/portal/features"

// Invite someone by email to set up a new workspace. The console picks the plan and terms;
// the invitee won't choose a plan or pay at setup. (The setup page itself comes with signup.)

const INVITE_DAYS = 14

async function requireWorkspaces() {
  const staff = await requireStaff("/workspaces")
  if (!can(staff.role, "workspaces")) return { staff, error: "You don't have permission to invite workspaces." }
  return { staff }
}

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`

function terms({ planName, billingCycle, startAs, trialDays, price }) {
  const start = startAs === "trial" ? `${trialDays}-day free trial` : "active from day one, billed by invoice"
  return `${planName} plan, billed ${billingCycle}${price != null ? ` at ${rs(price)}` : ""}, ${start}`
}

const emailInvite = (invite, inviter, link) =>
  sendEmail("workspace-invite", {
    to: invite.email,
    data: {
      contact_name: invite.contactName,
      company: invite.companyName,
      inviter,
      plan: invite.planName,
      trial_days: invite.startAs === "trial" ? invite.trialDays : null,
      link,
      days: INVITE_DAYS,
    },
  })

// New token for an invitation row; the link is only ever shown once
async function issueToken(db, id) {
  const token = newToken()
  await db("workspaceInvitations")
    .where({ id })
    .update({ tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), updatedAt: new Date() })
  return siteUrl("auth", `/setup/${token}`)
}

const inviteSchema = z
  .object({
    contactName: z.string().trim().min(2, "Enter their name.").max(120),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^(\+92|0)?3\d{2}[- ]?\d{7}$|^$/, "Enter a Pakistani mobile number, e.g. 0300 1234567.")
      .optional(),
    companyName: z.string().trim().max(150).optional(),
    planId: z.number({ message: "Pick a plan." }).int().positive(),
    billingCycle: z.enum(["monthly", "yearly"]),
    startAs: z.enum(["trial", "active"]),
    trialDays: z.number().int().min(1, "At least 1 day.").max(90, "At most 90 days.").nullable(),
    price: z.number().min(0).max(10_000_000).nullable(),
    note: z.string().trim().max(255).optional(),
    // A custom package instead of the plan's apps: { apps: [codes], off: { app: [keys] } }
    package: z.object({ apps: z.array(z.string()).min(1, "Pick at least one app.").max(50), off: z.record(z.string(), z.array(z.string())).default({}) }).nullable().optional(),
  })
  .refine((v) => v.startAs !== "trial" || v.trialDays != null, { path: ["trialDays"], message: "How many trial days?" })

// Returns { ok, link, emailed, emailError } or { error, fieldErrors }
export async function inviteWorkspace(input) {
  const { staff, error } = await requireWorkspaces()
  if (error) return { error }
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data

  const db = platformDb()
  const plan = await live(db, "plans").where({ id: v.planId, isActive: true }).first("id", "name")
  if (!plan) return { fieldErrors: { planId: "That plan isn't available. Pick another." } }

  const row = {
    email: v.email,
    contactName: v.contactName,
    phone: v.phone || null,
    companyName: v.companyName || null,
    planId: plan.id,
    billingCycle: v.billingCycle,
    startAs: v.startAs,
    trialDays: v.startAs === "trial" ? v.trialDays : null,
    price: v.price,
    note: v.note || null,
  }
  if (v.package) {
    const apps = await live(db, "apps").whereIn("code", v.package.apps).where({ isActive: true, alwaysOn: false }).pluck("code")
    if (!apps.length) return { fieldErrors: { package: "Pick at least one app." } }
    row.package = JSON.stringify({ apps, off: Object.fromEntries(apps.map((a) => [a, cleanOff(a, v.package.off?.[a])]).filter(([, k]) => k.length)) })
  }
  // A new invitation replaces any earlier unused one for this email (their links stop working)
  await supersede(db, v.email, staff.user.id)
  const [id] = await db("workspaceInvitations").insert({ ...row, invitedBy: staff.user.id, tokenHash: hashToken(newToken()), expiresAt: new Date(), createdBy: staff.user.id })
  const link = await issueToken(db, id)
  const mail = await emailInvite({ ...row, planName: plan.name }, staff.user.name, link)
  await logAudit({
    actorUserId: staff.user.id,
    action: "workspace_invite.sent",
    subjectType: "workspace_invitation",
    subjectId: id,
    details: { summary: `${row.companyName ?? row.contactName} <${row.email}>: ${terms({ ...row, planName: plan.name })}`, emailed: mail.ok },
  })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

// Unused invitations for an email are removed from the list when a newer one takes over
async function supersede(db, email, userId, exceptId = null) {
  let q = live(db, "workspaceInvitations").where({ email }).whereNull("acceptedAt")
  if (exceptId) q = q.whereNot({ id: exceptId })
  await q.update({ deletedAt: new Date(), deletedBy: userId })
}

// An invitation that hasn't been used to set up a workspace (pending, expired or cancelled)
async function unusedInvite(id) {
  return live(platformDb(), "workspaceInvitations")
    .join("plans as p", "p.id", "workspaceInvitations.planId")
    .where("workspaceInvitations.id", Number(id))
    .whereNull("workspaceInvitations.acceptedAt")
    .first("workspaceInvitations.*", "p.name as planName")
}

// Send a new single-use link: the previous link stops working, the expiry starts again, and a
// cancelled invitation becomes active again
// send: false makes a fresh link to copy and share, without emailing it
export async function resendWorkspaceInvite(id, { send = true } = {}) {
  const { staff, error } = await requireWorkspaces()
  if (error) return { error }
  const invite = await unusedInvite(id)
  if (!invite) return { error: "That invitation was already used to set up a workspace." }
  const db = platformDb()
  await supersede(db, invite.email, staff.user.id, invite.id)
  await db("workspaceInvitations").where({ id: invite.id }).update({ revokedAt: null, updatedBy: staff.user.id })
  const link = await issueToken(db, invite.id)
  if (!send) {
    await logAudit({ actorUserId: staff.user.id, action: "workspace_invite.link_copied", subjectType: "workspace_invitation", subjectId: invite.id, details: { summary: invite.email } })
    return { ok: true, link, copyOnly: true }
  }
  const mail = await emailInvite(invite, staff.user.name, link)
  await logAudit({
    actorUserId: staff.user.id,
    action: "workspace_invite.resent",
    subjectType: "workspace_invitation",
    subjectId: invite.id,
    details: { summary: `${invite.email}${invite.revokedAt ? " (was cancelled)" : ""}`, emailed: mail.ok },
  })
  return { ok: true, link, emailed: mail.ok, emailError: mail.ok ? null : mail.error }
}

export async function revokeWorkspaceInvite(id) {
  const { staff, error } = await requireWorkspaces()
  if (error) return { error }
  const invite = await unusedInvite(id)
  if (!invite || invite.revokedAt) return { error: "That invitation was already used or cancelled." }
  await platformDb()("workspaceInvitations").where({ id: invite.id }).update({ revokedAt: new Date(), updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: "workspace_invite.revoked", subjectType: "workspace_invitation", subjectId: invite.id, details: { summary: invite.email } })
  return { ok: true }
}
