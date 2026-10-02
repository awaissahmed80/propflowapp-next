"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { issueInvoice, setInvoiceStatus } from "../server/invoices"
import { PaymentDialog, VoidDialog } from "./invoice-actions"
import { InvoiceStatus } from "./parts"

// The invoice's status badge; for billing staff it's also a menu to change it:
// draft → issue · unpaid ↔ overdue · paid (asks for the payment) · paid → unpaid (reverses it) · void
// onChanged(message, tone) after any change.
export function InvoiceStatusMenu({ invoice, canManage, onChanged }) {
  const [dialog, setDialog] = useState(null)
  const [pending, startTransition] = useTransition()
  const shown = invoice.displayStatus ?? invoice.status
  if (!canManage || invoice.status === "void") return <InvoiceStatus status={shown} />

  const run = (fn, ok) =>
    startTransition(async () => {
      const r = await fn()
      if (r.error) onChanged(r.error, "error")
      else if (r.emailed === false) onChanged(`${invoice.code} issued, but the email couldn't be sent: ${r.emailError}`, "error")
      else onChanged(ok)
    })

  const s = invoice.status
  const items = [
    { type: "label", label: "Change status" },
    ...(s === "draft" ? [{ label: "Issue & email", icon: "send-plane-line", onClick: () => run(() => issueInvoice(invoice.id), `${invoice.code} issued and emailed.`) }] : []),
    ...(s === "overdue" ? [{ label: "Mark as unpaid", icon: "time-line", onClick: () => run(() => setInvoiceStatus(invoice.id, "issued"), `${invoice.code} marked unpaid.`) }] : []),
    ...(s === "issued" ? [{ label: "Mark as overdue", icon: "alarm-warning-line", onClick: () => run(() => setInvoiceStatus(invoice.id, "overdue"), `${invoice.code} marked overdue.`) }] : []),
    ...(["issued", "overdue"].includes(s) ? [{ label: "Mark as paid…", icon: "checkbox-circle-line", onClick: () => setDialog("pay") }] : []),
    ...(s === "paid"
      ? [{ label: "Mark as unpaid (reverse payment)", icon: "arrow-go-back-line", onClick: () => run(() => setInvoiceStatus(invoice.id, "issued"), `${invoice.code} marked unpaid; its payment was reversed.`) }]
      : []),
    ...(s !== "paid" ? [{ type: "separator" }, { label: "Void…", icon: "forbid-line", variant: "destructive", onClick: () => setDialog("void") }] : []),
  ]

  return (
    <>
      <DropdownMenu
        align="start"
        items={items}
        trigger={
          <button
            type="button"
            aria-label={`Status: ${shown}. Change status`}
            disabled={pending}
            className={cn("inline-flex cursor-pointer items-center gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", pending && "opacity-60")}
          >
            <InvoiceStatus status={shown} />
            <Icon name={pending ? "loader-3-fill" : "arrow-down-s-line"} className={cn("text-base text-muted-foreground", pending && "animate-spin")} />
          </button>
        }
      />
      {dialog === "pay" && (
        <PaymentDialog
          invoice={invoice}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null)
            onChanged(m)
          }}
        />
      )}
      {dialog === "void" && (
        <VoidDialog
          invoice={invoice}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setDialog(null)
            onChanged(m)
          }}
        />
      )}
    </>
  )
}

// The status menu on a page: reloads the page's data after a change and shows the outcome
export function InvoiceStatusControl({ invoice, canManage }) {
  const router = useRouter()
  const [notice, setNotice] = useState(null)
  return (
    <span className="inline-flex flex-col gap-2">
      <InvoiceStatusMenu
        invoice={invoice}
        canManage={canManage}
        onChanged={(text, tone = "success") => {
          setNotice({ tone, text })
          router.refresh()
        }}
      />
      {notice && <span className={cn("text-xs font-normal", notice.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>{notice.text}</span>}
    </span>
  )
}
