"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { CopyField } from "@/components/copy-field"

// After any email that carries a link (invitations, resends): whether the email went out, and
// the link with a copy button so it can also be shared on WhatsApp or anywhere else.
//   result: { link, emailed, emailError, copyOnly? }  copyOnly: a new link was made, no email sent
export function LinkSentDialog({ result, email, days, onClose }) {
  const title = result.copyOnly ? "New invitation link" : result.emailed ? "Invitation sent" : "Invitation created"
  const description = result.copyOnly
    ? `Share this link with ${email}. It works for ${days} days; earlier links for this invitation no longer work.`
    : result.emailed
      ? `We emailed ${email} a link to join. You can also copy it and share it yourself. It works for ${days} days.`
      : `The email to ${email} couldn't be sent, so share this link with them yourself. It works for ${days} days.`
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={description} footer={<Button onClick={onClose}>Done</Button>}>
      {!result.copyOnly && !result.emailed && result.emailError && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Icon name="error-warning-line" className="mt-0.5" /> {result.emailError}
        </p>
      )}
      <CopyField label="Invitation link" value={result.link} />
      <p className="text-xs text-muted-foreground">The link works once. Only send it to this person.</p>
    </Dialog>
  )
}
