"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// What people see when their role can't do something itself and it goes to Approvals: what
// happens next, and an optional note for the approver.
//   onSend(reason) → runs the action (the parent closes the dialog when it's done)
export const SENT_FOR_APPROVAL = "Sent for approval. It's waiting in Approvals."

export function ApprovalReasonDialog({ title, description, confirmLabel = "Send for approval", icon = "send-plane-line", placeholder = "e.g. Buyer showed the deposit slip at the counter.", onSend, onClose }) {
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title={title}
      description={description ?? "Your role can't do this directly. Someone who can approves it from their Approvals inbox."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={icon} loading={pending} onClick={() => startTransition(() => onSend(reason.trim()))}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea label="Note for the approver (optional)" rows={3} maxLength={300} placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Dialog>
  )
}
