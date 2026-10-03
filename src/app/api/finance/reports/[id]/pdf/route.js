import { NextResponse } from "next/server"
import { financeContext } from "@/modules/finance/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/finance/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderReportPdf } from "@/server/documents/report-pdf"
import { reportFileName } from "@/lib/reports"

// GET /api/finance/reports/trial-balance/pdf?asOf=last-month → the report as a PDF download
export async function GET(request, { params }) {
  const { id } = await params
  const report = getReport(id)
  if (!report) return new NextResponse("Report not found", { status: 404 })
  const ctx = await financeContext(`/finance/reports/${id}`)
  if (!ctx.can("view") || (report.feature && !ctx.has(report.feature))) return new NextResponse("Not allowed", { status: 403 })
  const result = await runReport(ctx, report, Object.fromEntries(request.nextUrl.searchParams), await reportFilters(ctx))
  const pdf = await renderReportPdf({ report: reportMeta(report), result, brand: await getWorkspaceBrand(ctx.tenant), generatedBy: ctx.user.name })
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportFileName(report.title)}.pdf"`, "Cache-Control": "private, no-store" } })
}
