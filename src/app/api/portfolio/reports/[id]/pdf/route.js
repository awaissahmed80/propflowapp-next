import { NextResponse } from "next/server"
import { estateContext } from "@/modules/portfolio/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/portfolio/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderReportPdf } from "@/server/documents/report-pdf"
import { reportFileName } from "@/lib/reports"

// GET /api/portfolio/reports/availability/pdf?project=ske → the report as a PDF download
export async function GET(request, { params }) {
  const { id } = await params
  const report = getReport(id)
  if (!report) return new NextResponse("Report not found", { status: 404 })
  const ctx = await estateContext(`/project-portfolio/reports/${id}`)
  if (!ctx.can("view") || !ctx.has("reports")) return new NextResponse("Not allowed", { status: 403 })
  const result = await runReport(ctx, report, Object.fromEntries(request.nextUrl.searchParams), await reportFilters(ctx))
  const pdf = await renderReportPdf({ report: reportMeta(report), result, brand: await getWorkspaceBrand(ctx.tenant), generatedBy: ctx.user.name })
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportFileName(report.title)}.pdf"`, "Cache-Control": "private, no-store" } })
}
