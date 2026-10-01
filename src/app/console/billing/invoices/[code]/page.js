import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate } from "@/lib/format"
import { requireArea } from "@/modules/console/server/access"
import { getInvoice } from "@/modules/console/server/queries"
import { getPaymentSettings } from "@/modules/console/server/payments"
import { can } from "@/modules/console/roles"
import { Icon } from "@/components/ui/icon"
import { InvoiceStatusControl } from "@/modules/console/components/invoice-status-menu"
import { InvoiceActions } from "@/modules/console/components/invoice-actions"
import { InvoiceDocument } from "@/modules/console/components/invoice-document"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { fromUrlCode, urlCode } from "@/lib/url"

export async function generateMetadata({ params }) {
  const code = fromUrlCode((await params).code)
  return { title: code }
}

const SAVED = {
  draft: ["success", "Draft saved. Issue it when it's ready to send."],
  sent: ["success", "Invoice issued and emailed to the workspace."],
  "email-failed": ["error", "Invoice issued, but the email couldn't be sent. Use Resend once email is working."],
}

// A workspace invoice, laid out to print or save as PDF, with billing actions above it
export default async function InvoicePage({ params, searchParams }) {
  const [{ code }, { saved, print }] = await Promise.all([params, searchParams])
  const staff = await requireArea("billing", `/billing/invoices/${urlCode(code)}`)
  const [inv, payments] = await Promise.all([getInvoice(code), getPaymentSettings()])
  if (!inv) notFound()
  const bank = payments.methods.find((m) => m.id === "bank")?.enabled ? payments.bank : null
  const status = inv.status === "issued" && inv.payments.some((p) => p.status === "pending") ? "awaiting" : inv.status
  const overdue = ["issued", "overdue"].includes(inv.status) && inv.dueAt && new Date(inv.dueAt) < new Date()

  return (
    <div className="space-y-6 p-4 pb-0 sm:p-6 sm:pb-0 lg:p-8 lg:pb-0 print:p-0">
      <div data-print="hide" className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/billing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left-line" /> Billing
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{inv.code}</h1>
            <InvoiceStatusControl invoice={{ id: inv.id, code: inv.code, status: inv.status, total: inv.total, displayStatus: overdue ? "overdue" : status }} canManage={can(staff.role, "billing")} />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/workspaces/${urlCode(inv.tenant.code)}`} className="text-primary hover:underline">
              {inv.tenant.name}
            </Link>
            {inv.createdByName ? ` · created by ${inv.createdByName}` : ""}
          </p>
        </div>
        <InvoiceActions invoice={{ id: inv.id, code: inv.code, status: inv.status, total: inv.total }} canManage={can(staff.role, "billing")} saved={SAVED[saved] ?? null} />
      </div>

      {inv.status === "void" && (
        <p data-print="hide" className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Icon name="forbid-line" /> Voided {formatDate(inv.voidedAt)}: {inv.voidReason}
        </p>
      )}

      <InvoiceDocument inv={inv} bank={bank} />
      {print === "1" && <PrintOnLoad />}
    </div>
  )
}
