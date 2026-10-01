import { NextResponse } from "next/server"
import { getSession, getStaffRole } from "@/server/auth/dal"
import { canView } from "@/modules/console/roles"
import { getInvoice } from "@/modules/console/server/queries"
import { getPaymentSettings } from "@/modules/console/server/payments"
import { renderInvoicePdf } from "@/server/documents/invoice-pdf"
import { fromUrlCode } from "@/lib/url"

// GET /api/console/invoices/INV-2026-00001/pdf → the invoice as a PDF download (console staff
// who can see billing). ?inline=1 shows it in the browser instead of downloading.
export async function GET(request, { params }) {
  const session = await getSession()
  const role = session?.kind === "console" ? await getStaffRole(session.user.id) : null
  if (!role || !canView(role, "billing")) return new NextResponse("Not allowed", { status: 403 })

  const code = fromUrlCode((await params).code)
  const inv = await getInvoice(code)
  if (!inv) return new NextResponse("Invoice not found", { status: 404 })
  const payments = await getPaymentSettings()
  const bank = payments.methods.find((m) => m.id === "bank")?.enabled ? payments.bank : null

  const pdf = await renderInvoicePdf(inv, bank)
  const inline = request.nextUrl.searchParams.get("inline") === "1"
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${inv.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
