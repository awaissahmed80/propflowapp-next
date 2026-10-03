"use client"

import { useState, useTransition } from "react"
import { formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { closeRequest, recordFee, sendTransferForApproval, waiveFee } from "../server/actions"

// The dialogs on a service request: resolve or reject with a note, record or waive the fee, and
// send a transfer for approval. Each calls onDone() after saving (the toast says what happened).

function useSave(onDone) {
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState({})
  const save = (fn, messages) =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(fn, messages)
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (!r?.error) onDone(r)
    })
  return { pending, errors, save }
}

function Footer({ onClose, pending, label, icon = "check-line", onClick, disabled, destructive, extra }) {
  return (
    <>
      {extra}
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button variant={destructive ? "destructive" : "default"} leftIcon={icon} loading={pending} disabled={disabled} onClick={onClick}>
        {label}
      </Button>
    </>
  )
}

// Resolve (complaints, documents, record updates) or reject any request, with a note the buyer can be told
export function ResolveDialog({ request: r, outcome, onClose, onDone }) {
  const [text, setText] = useState("")
  const { pending, errors, save } = useSave(onDone)
  const reject = outcome === "rejected"
  const complaint = r.type === "complaint"
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title={reject ? `Reject ${r.code}?` : complaint ? "Resolve complaint" : "Mark as done"}
      description={reject ? "The request is closed as rejected. Say why, so the buyer can be told." : r.subject}
      footer={
        <Footer
          onClose={onClose}
          pending={pending}
          destructive={reject}
          icon={reject ? "close-circle-line" : "checkbox-circle-line"}
          label={reject ? "Reject request" : complaint ? "Resolve" : "Mark as done"}
          disabled={text.trim().length < 3}
          onClick={() => save(() => closeRequest(r.code, outcome, text), { loading: reject ? "Rejecting…" : "Closing…", success: reject ? `${r.code} rejected.` : complaint ? "Complaint resolved." : "Marked as done." })}
        />
      }
    >
      <Textarea
        label={reject ? "Reason" : complaint ? "What was done" : "Note"}
        required
        rows={3}
        autoFocus
        placeholder={
          reject ? "e.g. Seller's CNIC has expired. Asked both parties to reapply." : complaint ? "e.g. Plumber replaced the float valve. Supply restored." : "e.g. Duplicate letter handed over at the counter."
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={errors.note}
      />
    </Dialog>
  )
}

// Record the fee as received (into a cash or bank account), or (services.waive) waive it with a reason
//   accounts: [{ id, name, kind, bankName, isDefault }] cash and bank accounts
export function FeeDialog({ request: r, canWaive, accounts = [], onClose, onDone }) {
  const methods = useList("payment-method")
  const [method, setMethod] = useState(methods.defaultValue ?? methods.options[0]?.value ?? "")
  const [ref, setRef] = useState("")
  const [accountId, setAccountId] = useState(() => (accounts.find((a) => a.isDefault) ?? accounts[0])?.id ?? null)
  const [waiving, setWaiving] = useState(false)
  const [reason, setReason] = useState("")
  const { pending, errors, save } = useSave(onDone)
  const amount = formatPkr(r.fee.amount)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title={waiving ? "Waive fee" : "Record fee"}
      description={`${amount} for ${r.code} · ${r.subject}`}
      footer={
        waiving ? (
          <Footer
            onClose={onClose}
            pending={pending}
            icon="hand-heart-line"
            label="Waive fee"
            disabled={reason.trim().length < 3}
            extra={
              <Button variant="ghost" className="mr-auto" onClick={() => setWaiving(false)}>
                Record payment instead
              </Button>
            }
            onClick={() => save(() => waiveFee(r.code, reason), { loading: "Waiving…", success: "Fee waived." })}
          />
        ) : (
          <Footer
            onClose={onClose}
            pending={pending}
            icon="receipt-line"
            label="Fee received"
            disabled={!method}
            extra={
              canWaive && (
                <Button variant="ghost" className="mr-auto" onClick={() => setWaiving(true)}>
                  Waive instead
                </Button>
              )
            }
            onClick={() => save(() => recordFee(r.code, { method, ref, accountId }), { loading: "Saving…", success: `${amount} received.` })}
          />
        )
      }
    >
      {waiving ? (
        <Textarea label="Reason" required rows={2} autoFocus placeholder="e.g. Transfer between father and son, waived by the director" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Method" required value={method} onChange={setMethod} options={methods.options} error={errors.method} />
          <Input label="Receipt or reference" placeholder="e.g. RCP-1182" value={ref} onChange={(e) => setRef(e.target.value)} error={errors.ref} />
          {accounts.length > 0 && (
            <div className="sm:col-span-2">
              <Select
                label="Received into"
                value={accountId ? String(accountId) : ""}
                onChange={(v) => setAccountId(Number(v))}
                options={accounts.map((a) => ({ value: String(a.id), label: [a.name, a.bankName].filter(Boolean).join(" · ") }))}
                error={errors.accountId}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

// Without services.transfer: ask someone who can complete it (Approvals in My Desk)
export function ApprovalDialog({ request: r, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const { pending, errors, save } = useSave(onDone)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title="Send transfer for approval"
      description={`Someone who can complete transfers gets it in their approvals inbox. The file moves to ${r.data.to?.name ?? "the purchaser"} once it's approved.`}
      footer={
        <Footer
          onClose={onClose}
          pending={pending}
          icon="send-plane-line"
          label="Send for approval"
          onClick={() => save(() => sendTransferForApproval(r.code, reason), { loading: "Sending…", success: "Sent for approval. The transfer completes once it's approved." })}
        />
      }
    >
      <Textarea label="Note for the approver" rows={3} placeholder="e.g. Checklist complete: NDC, fee and biometric verification done." value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
    </Dialog>
  )
}
