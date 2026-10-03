import { NextResponse } from "next/server"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderVoucherPdf } from "@/server/documents/finance-pdf"
import { financeContext } from "@/modules/finance/server/context"
import { getVoucher } from "@/modules/finance/server/queries"

// GET /api/finance/vouchers/bpv-2627-00001/pdf → the voucher as a PDF download
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await financeContext(`/finance/vouchers?open=${code}`)
  if (!ctx.can("view")) return new NextResponse("Not allowed", { status: 403 })
  const v = await getVoucher(ctx, decodeURIComponent(code))
  if (!v) return new NextResponse("Voucher not found", { status: 404 })
  const pdf = await renderVoucherPdf({ v, brand: await getWorkspaceBrand(ctx.tenant) })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Voucher ${v.code}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
