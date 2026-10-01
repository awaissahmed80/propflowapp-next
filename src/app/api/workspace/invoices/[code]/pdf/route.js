import { NextResponse } from "next/server"
import { settingsPage } from "@/modules/settings/context"
import { invoiceBank, workspaceInvoice } from "@/modules/settings/billing/queries"
import { renderInvoicePdf } from "@/server/documents/invoice-pdf"

// GET /api/workspace/invoices/inv-2026-00001/pdf → one of this workspace's PropFlow invoices as a PDF
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await settingsPage("/settings/billing")
  const inv = await workspaceInvoice(ctx.tenant.id, code)
  if (!inv) return new NextResponse("Invoice not found", { status: 404 })
  const pdf = await renderInvoicePdf(inv, await invoiceBank())
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.code}.pdf"`, "Cache-Control": "private, no-store" } })
}
