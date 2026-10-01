"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { issueInvoice, recordPayment, resendInvoice, voidInvoice } from "../server/invoices"
import { Notice } from "./parts"
import { urlCode } from "@/lib/url"

const METHODS = [
  { value: "bank", label: "Bank transfer (IBFT)" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Debit or credit card" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
]
const pkToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)

const MAX_PROOF = 10 * 1024 * 1024
const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Pick or drop the proof of payment (image or PDF, up to 10 MB)
function ProofPicker({ file, onChange, error }) {
  const [over, setOver] = useState(false)
  const pick = (f) => f && onChange(f)
  return (
    <div>
      <p className="mb-1.5 text-base text-muted-foreground">
        Proof of payment <span className="text-sm text-destructive">*</span>
      </p>
      {file ? (
        <div className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", error && "border-destructive")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-lg text-muted-foreground">
            <Icon name={file.type === "application/pdf" ? "file-pdf-2-line" : "image-line"} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{file.name}</span>
            <span className="block text-xs text-muted-foreground">{sizeLabel(file.size)}</span>
          </span>
          <IconButton icon="close-line" aria-label="Remove file" onClick={() => onChange(null)} />
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            pick(e.dataTransfer.files?.[0])
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/50",
            over && "border-primary bg-primary/5",
            error && "border-destructive"
          )}
        >
          <Icon name="upload-cloud-2-line" className="text-2xl text-muted-foreground" />
          <span className="text-sm font-medium">Choose a file or drop it here</span>
          <span className="text-xs text-muted-foreground">Bank receipt, deposit slip or cheque photo · JPG, PNG, WebP or PDF, up to 10 MB</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="mt-1.5 text-[13px] text-destructive">{error}</p>}
    </div>
  )
}

export function PaymentDialog({ invoice, onClose, onDone }) {
  const [form, setForm] = useState({ method: "bank", reference: "", paidOn: pkToday() })
  const [proof, setProof] = useState(null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const chooseProof = (f) => {
    setErrors((e) => ({ ...e, proof: undefined }))
    if (f && f.size > MAX_PROOF) return setErrors((e) => ({ ...e, proof: "That file is over 10 MB. Attach a smaller photo or PDF." }))
    setProof(f)
  }
  const submit = () => {
    if (!proof) return setErrors((e) => ({ ...e, proof: "Attach proof of payment." }))
    const data = new FormData()
    data.set("method", form.method)
    data.set("reference", form.reference)
    data.set("paidOn", form.paidOn)
    data.set("proof", proof)
    startTransition(async () => {
      setError("")
      const r = await recordPayment(invoice.id, data)
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else onDone("Payment recorded with its proof. The invoice is paid.")
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Record payment for ${invoice.code}`}
      description={`Marks ${formatAmount(invoice.total)} as received and the invoice as paid. A past-due workspace becomes active again.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Select label="Paid with" value={form.method} onChange={set("method")} options={METHODS} error={errors.method} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker label="Received on" value={form.paidOn} onChange={set("paidOn")} maxDate={pkToday()} clearable={false} error={errors.paidOn} />
          <Input label="Reference (optional)" placeholder="Bank ref or cheque no." value={form.reference} onChange={(e) => set("reference")(e.target.value)} error={errors.reference} />
        </div>
        <ProofPicker file={proof} onChange={chooseProof} error={errors.proof} />
      </div>
    </Dialog>
  )
}

export function VoidDialog({ invoice, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Void ${invoice.code}?`}
      description="The invoice stays on record, marked void, and can't be paid. Its number isn't reused."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await voidInvoice(invoice.id, reason)
                if (r.fieldErrors) setErrors(r.fieldErrors)
                else if (r.error) setError(r.error)
                else onDone("Invoice voided.")
              })
            }
          >
            Void invoice
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Textarea label="Reason" rows={3} placeholder="e.g. Wrong amount, reissued as the next invoice" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
    </Dialog>
  )
}

// Buttons above an invoice: issue (drafts), record payment, resend, print, void
export function InvoiceActions({ invoice, canManage, saved }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(saved ? { tone: saved[0], text: saved[1] } : null)
  const [pending, startTransition] = useTransition()
  const done = (text, tone = "success") => {
    setDialog(null)
    setNotice({ tone, text })
    router.refresh()
  }
  const run = (fn, ok) =>
    startTransition(async () => {
      const r = await fn()
      if (r.error) setNotice({ tone: "error", text: r.error })
      else if (r.emailed === false) done(`${ok.replace(" and emailed", "")}, but the email couldn't be sent: ${r.emailError}`, "error")
      else done(ok)
    })
  const open = ["issued", "overdue"].includes(invoice.status)

  return (
    <div className="flex max-w-xl flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        {canManage && invoice.status === "draft" && (
          <Button leftIcon="send-plane-line" loading={pending} onClick={() => run(() => issueInvoice(invoice.id), "Invoice issued and emailed to the workspace.")}>
            Issue &amp; email
          </Button>
        )}
        {canManage && open && (
          <Button leftIcon="check-line" onClick={() => setDialog("pay")}>
            Record payment
          </Button>
        )}
        <Button variant="outline" leftIcon="file-download-line" nativeButton={false} render={<a href={`/api/console/invoices/${urlCode(invoice.code)}/pdf`} download={`${invoice.code}.pdf`} />}>
          Download PDF
        </Button>
        <Button variant="outline" leftIcon="printer-line" onClick={() => window.print()}>
          Print
        </Button>
        {canManage && invoice.status !== "void" && invoice.status !== "paid" && (
          <DropdownMenu
            align="end"
            items={[
              ...(open ? [{ label: "Resend email", icon: "mail-send-line", onClick: () => run(() => resendInvoice(invoice.id), "Invoice emailed again.") }, { type: "separator" }] : []),
              { label: "Void invoice", icon: "forbid-line", variant: "destructive", onClick: () => setDialog("void") },
            ]}
            trigger={<Button variant="outline" size="icon" aria-label="More actions" leftIcon="more-2-line" disabled={pending} />}
          />
        )}
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {dialog === "pay" && <PaymentDialog invoice={invoice} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "void" && <VoidDialog invoice={invoice} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
