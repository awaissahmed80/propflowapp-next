import { NextResponse } from "next/server"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderPaymentRequestPdf } from "@/server/documents/payment-request-pdf"
import { financeContext } from "@/modules/finance/server/context"
import { getPaymentRequest } from "@/modules/finance/server/money-queries"

// GET /api/finance/payment-requests/inv-2627-00001/pdf → the payment request as a PDF download
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await financeContext(`/finance/payment-requests`)
  if (!ctx.can("view") || !ctx.has("collections")) return new NextResponse("Not allowed", { status: 403 })
  const q = await getPaymentRequest(ctx, code)
  if (!q) return new NextResponse("Payment request not found", { status: 404 })
  const pdf = await renderPaymentRequestPdf({ q, brand: await getWorkspaceBrand(ctx.tenant) })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Payment request ${q.code}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
