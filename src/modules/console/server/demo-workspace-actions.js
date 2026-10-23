"use server"

import { after } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/server/auth/dal"
import { siteUrl } from "@/lib/sites"
import { sendEmail } from "@/server/mail/send"
import { can } from "@/modules/console/roles"
import { demoWorkspaceStatus, startDemoJob } from "@/server/tenants/demo-workspace"
import { logAudit } from "./audit"

// Console › Workspaces › Demo workspace: install, reset (wipe and build again with a new
// password), remove, and email its sign-ins to a prospective customer. Install and reset run after
// the answer goes back; the card polls their progress.

async function manager() {
  const staff = await requireStaff("/workspaces")
  if (!can(staff.role, "workspaces")) return { error: "Only the platform owner or an administrator can do this." }
  return { staff }
}

const LABEL = { install: "demo.installed", reset: "demo.reset", remove: "demo.removed" }

async function start(mode) {
  const { staff, error } = await manager()
  if (error) return { error }
  const job = await startDemoJob(mode, { actorUserId: staff.user.id })
  if (job.error) return job
  const code = job.previous?.code ?? null
  await logAudit({
    actorUserId: staff.user.id,
    action: LABEL[mode],
    subjectType: "tenant",
    subjectId: job.previous?.tenantId ?? null,
    details: { summary: `Demo workspace${code ? ` (${code})` : ""}: ${mode === "install" ? "installed" : mode === "reset" ? "reset with a new password" : "removed"}` },
  })
  // The work carries on after the answer is sent; the card shows its progress
  after(() => job.run())
  return { ok: true }
}

export const installDemoWorkspace = async () => start("install")
export const resetDemoWorkspace = async () => start("reset")
export const removeDemoWorkspace = async () => start("remove")

const detailsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  name: z.string().trim().min(1, "Enter their name.").max(120),
  note: z.string().trim().max(1000).optional().default(""),
})

// Email the demo workspace's sign-ins (and the shared password) to someone → { ok } | { error }
export async function sendDemoDetails(input) {
  const staff = await requireStaff("/workspaces")
  if (!can(staff.role, "workspaces") && !can(staff.role, "enquiries")) return { error: "Your console role can't send demo details." }
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: parsed.error.issues[0].path[0] }
  const { email, name, note } = parsed.data
  const { state, tenant, people, company } = await demoWorkspaceStatus()
  if (state?.status !== "ready" || !tenant || !state.password) return { error: "Install the demo workspace first." }
  const sent = await sendEmail("demo-details", {
    to: email,
    data: {
      name,
      company,
      link: siteUrl("auth", "/"),
      password: state.password,
      note: note || null,
      sent_by: note ? `${staff.user.name}, PropFlow` : null,
      people: people.map((p) => ({ label: p.label, email: p.email, try: p.try })),
    },
  })
  if (!sent.ok) return { error: "The email couldn't be sent. Try again." }
  await logAudit({ actorUserId: staff.user.id, action: "demo.details_sent", subjectType: "tenant", subjectId: tenant.id, details: { summary: `Demo details to ${name} <${email}>`, email, name } })
  return { ok: true }
}
