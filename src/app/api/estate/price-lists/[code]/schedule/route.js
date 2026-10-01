import { NextResponse } from "next/server"
import { estateContext } from "@/modules/estate/server/context"
import { getPriceList, pdfLabels, scheduleInput } from "@/modules/estate/server/price-list-queries"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderSchedulePdf } from "@/server/documents/price-list-pdf"

// GET /api/estate/price-lists/pl-0001/schedule?… (same query as the schedule page) → PDF download
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await estateContext(`/estate/price-lists/${code}`)
  if (!ctx.can("view") || !ctx.has("price-lists")) return new NextResponse("Not allowed", { status: 403 })
  const list = await getPriceList(ctx, code)
  if (!list) return new NextResponse("Price list not found", { status: 404 })
  const { unit, input, planKey, start } = scheduleInput(list, Object.fromEntries(request.nextUrl.searchParams))
  const pdf = await renderSchedulePdf({ list, unit, input, planKey, start, brand: await getWorkspaceBrand(ctx.tenant), labels: await pdfLabels(ctx.db), preparedBy: ctx.user.name })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Payment schedule ${list.project.code}${unit ? ` ${unit.number}` : ""}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
