import { notFound } from "next/navigation"
import { settingsPage } from "@/modules/settings/context"
import { invoiceBank, workspaceInvoice } from "@/modules/settings/billing/queries"
import { InvoiceDocument } from "@/modules/console/components/invoice-document"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"

export const metadata = { title: "Print invoice" }

// A PropFlow invoice as it prints, for the preview's Print button (opens the print dialog on load)
export default async function WorkspaceInvoicePrintPage({ params }) {
  const { code } = await params
  const ctx = await settingsPage(`/settings/billing/invoices/${code}`)
  const inv = await workspaceInvoice(ctx.tenant.id, code)
  if (!inv) notFound()
  const payments = inv.payments.map((p) => ({ ...p, proofKey: null }))
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <InvoiceDocument inv={{ ...inv, payments }} bank={await invoiceBank()} />
      <PrintOnLoad />
    </div>
  )
}
