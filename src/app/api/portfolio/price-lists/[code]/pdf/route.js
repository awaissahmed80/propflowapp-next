import { NextResponse } from "next/server"
import { estateContext } from "@/modules/portfolio/server/context"
import { getPriceList, pdfLabels } from "@/modules/portfolio/server/price-list-queries"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderPriceListPdf } from "@/server/documents/price-list-pdf"

// GET /api/portfolio/price-lists/pl-0001/pdf → the price list as a PDF download
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await estateContext(`/project-portfolio/price-lists/${code}`)
  if (!ctx.can("view") || !ctx.has("price-lists")) return new NextResponse("Not allowed", { status: 403 })
  const list = await getPriceList(ctx, code)
  if (!list) return new NextResponse("Price list not found", { status: 404 })
  const pdf = await renderPriceListPdf({ list, brand: await getWorkspaceBrand(ctx.tenant), labels: await pdfLabels(ctx.db) })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${list.code} ${list.project.name} v${list.version}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
