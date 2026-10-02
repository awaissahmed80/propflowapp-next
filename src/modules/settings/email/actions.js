"use server"

import { z } from "zod"
import { logActivity } from "@/server/tenants/activity"
import { openSecret, sealSecret } from "@/server/secret-box"
import { SMTP_KEY, readSmtp, sendWorkspaceMail, smtpError, smtpTransport } from "@/server/mail/workspace-smtp"
import { writeSettings } from "@/modules/portal/server/setup"
import { settingsPage } from "../context"

// Settings › Email: the workspace's own SMTP account, used to email leads and customers from
// PropFlow. Needs setup rights. The password is sealed with ENCRYPTION_KEY and never sent back
// to the browser; leaving it empty when editing keeps the saved one.

async function emailAction() {
  const ctx = await settingsPage("/settings/email")
  if (!ctx.canEdit) return { error: "Only the owner or an administrator can change email settings." }
  return { ctx }
}

const schema = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Enter the server's host name, e.g. smtp.gmail.com.")
    .max(150)
    .regex(/^[a-z0-9.-]+$/, "Use the host name only, without http://."),
  port: z.coerce.number().int().min(1, "Enter a port.").max(65535),
  security: z.enum(["ssl", "starttls", "none"]),
  user: z.string().trim().max(190).optional().default(""),
  password: z.string().max(300).optional().default(""),
  fromName: z.string().trim().max(120).optional().default(""),
  fromEmail: z.string().trim().toLowerCase().pipe(z.email("Enter the address emails come from.")),
  replyTo: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default("")
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid reply-to address, or leave it empty."),
})

const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))

// Check the account works, then save it → { ok } | { fieldErrors } | { error }
export async function saveEmailSettings(input) {
  const { ctx, error } = await emailAction()
  if (error) return { error }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const v = parsed.data
  const saved = await readSmtp(ctx.db)
  // Empty password while editing the same account: keep the saved one
  const password = v.password || (saved && saved.user === v.user ? openSecret(saved.password) : null) || ""
  if (v.user && !password) return { fieldErrors: { password: "Enter the password (or app password) for this account." } }

  try {
    await smtpTransport(v, password).verify()
  } catch (err) {
    return { error: smtpError(err) }
  }
  const { password: _omit, ...rest } = v
  void _omit
  await writeSettings(ctx.tenant, { [SMTP_KEY]: { ...rest, password: v.user ? sealSecret(password) : null, verifiedAt: new Date().toISOString() } }, ctx.session.user.id)
  await logActivity(ctx.db, { type: "settings", action: "email.saved", actorUserId: ctx.session.user.id, summary: `set up outgoing email (${v.fromEmail} via ${v.host})` })
  return { ok: true }
}

// A test email to the person signed in → { ok, to } | { error }
export async function sendTestEmail() {
  const { ctx, error } = await emailAction()
  if (error) return { error }
  const to = ctx.session.user.email
  const r = await sendWorkspaceMail(ctx.db, {
    to,
    subject: `Test email from ${ctx.tenant.name}`,
    text: `This is a test from PropFlow. Email from ${ctx.tenant.name} is working: leads and customers will receive emails from this address.`,
  })
  return r.ok ? { ok: true, to } : { error: r.error }
}

export async function removeEmailSettings() {
  const { ctx, error } = await emailAction()
  if (error) return { error }
  await writeSettings(ctx.tenant, { [SMTP_KEY]: null }, ctx.session.user.id)
  await logActivity(ctx.db, { type: "settings", action: "email.removed", actorUserId: ctx.session.user.id, summary: "removed the outgoing email settings" })
  return { ok: true }
}
