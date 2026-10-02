import { settingsPage } from "@/modules/settings/context"
import { readSmtp } from "@/server/mail/workspace-smtp"
import { EmailSettingsView } from "@/modules/settings/email/email-settings-view"

export const metadata = { title: "Email" }

// The workspace's outgoing email (SMTP), used to email leads and customers from PropFlow
export default async function EmailSettingsPage() {
  const ctx = await settingsPage("/settings/email")
  const s = await readSmtp(ctx.db)
  // Never send the password to the browser, only whether one is saved
  const saved = s
    ? {
        host: s.host,
        port: s.port,
        security: s.security,
        user: s.user ?? "",
        hasPassword: Boolean(s.password),
        fromName: s.fromName ?? "",
        fromEmail: s.fromEmail,
        replyTo: s.replyTo ?? "",
        verifiedAt: s.verifiedAt ?? null,
      }
    : null
  return <EmailSettingsView saved={saved} canEdit={ctx.canEdit} myEmail={ctx.session.user.email} />
}
