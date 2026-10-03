import { NextResponse } from "next/server"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderServicePaperPdf } from "@/server/documents/service-pdf"
import { servicesContext } from "@/modules/estate/server/context"
import { getRequest } from "@/modules/estate/server/queries"
import { PAPERS, requestPaper, unitTextFn } from "@/modules/estate/server/papers"

// GET /api/estate/requests/sr-2026-00001/ndc/pdf → the request's NDC, transfer letter or
// possession letter as a PDF download
export async function GET(request, { params }) {
  const { code, doc } = await params
  const ctx = await servicesContext(`/estate-management/requests/${code}`)
  if (!ctx.can("view")) return new NextResponse("Not allowed", { status: 403 })
  if (!PAPERS[doc]) return new NextResponse("Unknown document", { status: 404 })
  const r = await getRequest(ctx, code)
  const paper = r ? await requestPaper(ctx, r, doc) : null
  if (!paper) return new NextResponse("Document not found", { status: 404 })
  const [brand, unitText] = await Promise.all([getWorkspaceBrand(ctx.tenant), unitTextFn(ctx.db)])
  const pdf = await renderServicePaperPdf({ r, paper, brand, unitText })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${PAPERS[doc].file} ${paper.number}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
