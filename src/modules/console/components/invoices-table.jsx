"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount, formatDate } from "@/lib/format"
import { methodLabel } from "@/components/billing/methods"
import { DataTable } from "@/components/data-table"
import { IconButton } from "@/components/ui/icon-button"
import { printPage } from "@/lib/print"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { loadInvoice, resendInvoice } from "../server/invoices"
import { VoidDialog } from "./invoice-actions"
import { InvoiceDialog } from "./invoice-dialog"
import { InvoicePreviewDialog, download } from "./invoice-preview"
import { InvoiceStatus, Notice } from "./parts"
import { urlCode } from "@/lib/url"

const EDITABLE = ["draft", "issued", "overdue"]

// Invoices with a ⋮ menu per row (preview, edit, download PDF, print, resend, void).
// A row click opens the preview.
// rows: from listInvoices(). showWorkspace: add the workspace column (Billing page).
export function InvoicesTable({ rows, canManage, taxRate, showWorkspace = true, minWidth = "52rem", empty = "No invoices." }) {
  const router = useRouter()
  const [preview, setPreview] = useState(null) // invoice code
  const [editing, setEditing] = useState(null) // invoice from loadInvoice
  const [notice, setNotice] = useState(null)
  const [loadingCode, setLoadingCode] = useState(null)
  const [voiding, setVoiding] = useState(null) // invoice row being voided
  const [, startTransition] = useTransition()

  const edit = (code) =>
    startTransition(async () => {
      setLoadingCode(code)
      const r = await loadInvoice(code)
      setLoadingCode(null)
      if (r.error) setNotice({ tone: "error", text: r.error })
      else setEditing(r.inv)
    })
  const open = (row) => setPreview(row.code)
  const resend = (row) =>
    startTransition(async () => {
      setLoadingCode(row.code)
      const r = await resendInvoice(row.id)
      setLoadingCode(null)
      setNotice(r.error ? { tone: "error", text: r.error } : { tone: "success", text: `${row.code} emailed again, with the PDF attached.` })
    })

  const columns = [
    {
      key: "code",
      header: "Invoice",
      className: "font-mono text-xs",
      sortValue: (i) => i.code,
      cell: (i) => (
        <Link href={`/billing/invoices/${urlCode(i.code)}`} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {i.code}
        </Link>
      ),
    },
    ...(showWorkspace
      ? [
          {
            key: "tenant",
            header: "Workspace",
            sortValue: (i) => i.tenantName,
            cell: (i) => (
              <Link href={`/workspaces/${urlCode(i.tenantCode)}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                {i.tenantName}
              </Link>
            ),
          },
        ]
      : []),
    { key: "date", header: "Issued", className: "whitespace-nowrap", sortValue: (i) => i.issuedAt ?? "", cell: (i) => formatDate(i.issuedAt) || "—" },
    { key: "due", header: "Due", className: "whitespace-nowrap", sortValue: (i) => i.dueAt ?? "", cell: (i) => formatDate(i.dueAt) || "—" },
    { key: "method", header: "Paid with", sortValue: (i) => i.payment?.method ?? "", cell: (i) => (i.payment ? methodLabel(i.payment.method) : "—") },
    { key: "total", header: "Amount", className: "text-right tabular-nums whitespace-nowrap", sortValue: (i) => i.total, cell: (i) => formatAmount(i.total) },
    { key: "status", header: "Status", sortValue: (i) => i.displayStatus, cell: (i) => <InvoiceStatus status={i.displayStatus} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-px whitespace-nowrap text-right",
      cell: (i) => (
        <DropdownMenu
          align="end"
          items={[
            { label: "Preview", icon: "eye-line", onClick: () => setPreview(i.code) },
            ...(canManage && EDITABLE.includes(i.status) ? [{ label: "Edit", icon: "edit-line", onClick: () => edit(i.code) }] : []),
            { label: "Download PDF", icon: "file-download-line", onClick: () => download(`/api/console/invoices/${urlCode(i.code)}/pdf`, `${i.code}.pdf`) },
            { label: "Print", icon: "printer-line", onClick: () => printPage(`/billing/invoices/${urlCode(i.code)}?print=1`) },
            ...(canManage && ["issued", "overdue"].includes(i.status) ? [{ type: "separator" }, { label: "Resend email", icon: "mail-send-line", onClick: () => resend(i) }] : []),
            ...(canManage && !["paid", "void"].includes(i.status)
              ? [...(["issued", "overdue"].includes(i.status) ? [] : [{ type: "separator" }]), { label: "Void invoice…", icon: "forbid-line", variant: "destructive", onClick: () => setVoiding(i) }]
              : []),
          ]}
          trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${i.code}`} tooltip={false} loading={loadingCode === i.code} />}
        />
      ),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="min-h-0 flex-1">
        <DataTable columns={columns} rows={rows} minWidth={minWidth} onRowClick={open} empty={empty} />
      </div>
      {preview && (
        <InvoicePreviewDialog
          code={preview}
          canEdit={canManage}
          onClose={() => setPreview(null)}
          onEdit={(inv) => {
            setPreview(null)
            setEditing(inv)
          }}
        />
      )}
      {voiding && (
        <VoidDialog
          invoice={voiding}
          onClose={() => setVoiding(null)}
          onDone={(m) => {
            setVoiding(null)
            setNotice({ tone: "success", text: `${voiding.code}: ${m}` })
            router.refresh()
          }}
        />
      )}
      {editing && (
        <InvoiceDialog
          invoice={editing}
          taxRate={taxRate}
          onClose={() => setEditing(null)}
          onDone={(result, issued) => {
            setEditing(null)
            setNotice({
              tone: result.emailed === false ? "error" : "success",
              text:
                result.emailed === false
                  ? `${result.code} saved, but the email couldn't be sent: ${result.emailError}`
                  : issued
                    ? `${result.code} issued and emailed.`
                    : result.emailed
                      ? `${result.code} saved and emailed again.`
                      : `${result.code} saved.`,
            })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
