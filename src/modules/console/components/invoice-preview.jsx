"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { printPage } from "@/lib/print"
import { loadInvoice, resendInvoice } from "../server/invoices"
import { VoidDialog } from "./invoice-actions"
import { InvoiceDocument } from "./invoice-document"
import { InvoiceStatusMenu } from "./invoice-status-menu"
import { Notice } from "./parts"
import { urlCode } from "@/lib/url"

const EDITABLE = ["draft", "issued", "overdue"]

// Download a file (the server answers with Content-Disposition: attachment) without leaving the page
export function download(url, filename) {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// The invoice as it prints (A4), in a dialog. Header row: number and status menu, then
// edit, download PDF, print and more (resend, void) beside the close button.
// Print loads the invoice page in a hidden frame and prints it there: same tab, only the invoice.
export function InvoicePreviewDialog({ code, canEdit, onEdit, onClose }) {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [pending, startTransition] = useTransition()

  const reload = useCallback(
    () =>
      startTransition(async () => {
        const r = await loadInvoice(code)
        if (r.error) setError(r.error)
        else setData(r)
      }),
    [code],
  )
  useEffect(() => reload(), [reload])

  const changed = (text, tone = "success") => {
    setNotice({ tone, text })
    reload()
    router.refresh()
  }

  const inv = data?.inv
  const editable = inv && EDITABLE.includes(inv.status)
  const more = inv
    ? [
        ...(["issued", "overdue"].includes(inv.status)
          ? [
              {
                label: "Resend email",
                icon: "mail-send-line",
                onClick: () =>
                  startTransition(async () => {
                    const r = await resendInvoice(inv.id)
                    setNotice(r.error ? { tone: "error", text: r.error } : { tone: "success", text: `${inv.code} emailed again.` })
                  }),
              },
            ]
          : []),
        ...(!["paid", "void"].includes(inv.status) ? [{ label: "Void invoice…", icon: "forbid-line", variant: "destructive", onClick: () => setDialog("void") }] : []),
      ]
    : []

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-[min(58rem,calc(100%-4rem))]"
      bodyClassName="p-0"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {code}
          {inv && <InvoiceStatusMenu invoice={inv} canManage={canEdit} onChanged={changed} />}
        </span>
      }
      description={inv ? `${inv.tenant.name} · print preview (A4)` : "Loading…"}
      headerActions={
        inv && (
          <>
            {canEdit && editable && <IconButton icon="edit-line" aria-label="Edit invoice" onClick={() => onEdit(inv)} />}
            <IconButton icon="file-download-line" aria-label="Download PDF" onClick={() => download(`/api/console/invoices/${urlCode(code)}/pdf`, `${code}.pdf`)} />
            <IconButton icon="printer-line" aria-label="Print" onClick={() => printPage(`/billing/invoices/${urlCode(code)}?print=1`)} />
            {canEdit && more.length > 0 && <DropdownMenu align="end" items={more} trigger={<IconButton icon="more-2-line" aria-label="More actions" tooltip={false} disabled={pending} />} />}
          </>
        )
      }
    >
      {notice && (
        <div className="px-4 pt-3 sm:px-6 lg:px-8">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {error ? (
        <div className="p-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : inv ? (
        // A4Page cancels its page's padding to span the width, so give it that padding here
        <div className="px-4 sm:px-6 lg:px-8">
          <InvoiceDocument inv={inv} bank={data.bank} />
        </div>
      ) : (
        <div className="flex h-96 items-center justify-center text-muted-foreground">
          <Icon name="loader-3-fill" className="animate-spin text-2xl" />
        </div>
      )}
      {dialog === "void" && inv && (
        <VoidDialog
          invoice={inv}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null)
            changed(m)
          }}
        />
      )}
    </Dialog>
  )
}
