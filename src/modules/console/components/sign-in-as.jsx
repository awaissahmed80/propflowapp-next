"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { startImpersonation } from "../server/impersonation-actions"

// "Sign in as" on a workspace's member: asks why, then opens the portal as them for up to an hour.
//   tenantCode · member: { id, name, email } · tenantName · minutes
export function SignInAs({ tenantCode, tenantName, member, minutes = 60 }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState(null)
  const [pending, startTransition] = useTransition()
  const go = () =>
    startTransition(async () => {
      setError(null)
      const r = await startImpersonation(tenantCode, member.id, reason)
      // On success the server redirects to the portal
      if (r?.error) {
        setError(r.error)
        toast.error(r.error)
      }
    })
  return (
    <>
      <Button size="sm" variant="ghost" leftIcon="spy-line" onClick={() => setOpen(true)}>
        Sign in as
      </Button>
      {open && (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title={`Sign in as ${member.name}?`}
          description={`You'll see ${tenantName} exactly as ${member.name} does, for up to ${minutes} minutes. Everything you do is done as them. The start and end are recorded in the console audit log.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button leftIcon="spy-line" loading={pending} onClick={go}>
                Sign in as {member.name.split(" ")[0]}
              </Button>
            </>
          }
        >
          <Textarea label="Reason" required rows={3} placeholder="e.g. Ticket SR-1042: checking why their booking won't save" value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} />
        </Dialog>
      )}
    </>
  )
}
