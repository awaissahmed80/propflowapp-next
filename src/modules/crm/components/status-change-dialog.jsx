"use client"

import { useState } from "react"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { LeadStatusBadge } from "./lead-parts"

// Confirm a status change by hand: Lost asks why; with Settings › CRM › "Ask for an update"
// on, every change asks what happened (saved in the lead's history with the change).
//   <StatusChangeDialog name="Ali Raza" status="lost" needUpdate onConfirm={({ lossReason, note }) => …} onClose={…} />
export function StatusChangeDialog({ name, status, needUpdate = false, pending = false, onConfirm, onClose }) {
  const statuses = useList("lead-status")
  const [lossReason, setLossReason] = useState("")
  const [note, setNote] = useState("")
  const lost = status === "lost"
  const ready = (!lost || lossReason) && (!needUpdate || note.trim())
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title={lost ? `Mark ${name} as lost?` : `Move ${name} to ${statuses.label(status)}?`}
      description={lost ? "Planned follow-ups are dropped. You can reopen the lead later." : needUpdate ? "Your workspace asks for a short update with every status change." : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={lost ? "destructive" : "default"} leftIcon={lost ? "close-circle-line" : "check-line"} disabled={!ready} loading={pending} onClick={() => onConfirm({ lossReason, note: note.trim() })}>
            {lost ? "Mark as lost" : "Change status"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!lost && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            New status <LeadStatusBadge status={status} />
          </p>
        )}
        {lost && <LookupSelect list="loss-reason" label="Why?" value={lossReason} onChange={setLossReason} />}
        <Textarea
          label={needUpdate ? "What happened?" : "Update (optional)"}
          required={needUpdate}
          rows={3}
          autoFocus={!lost}
          placeholder="e.g. Paid the token at the site office; wants the corner plot"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
