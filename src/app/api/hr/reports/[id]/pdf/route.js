import { NextResponse } from "next/server"
import { hrContext } from "@/modules/hr/server/context"
import { canOpenReport, getReport, reportFilters, reportMeta, runReport } from "@/modules/hr/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderReportPdf } from "@/server/documents/report-pdf"
import { reportFileName } from "@/lib/reports"

// GET /api/hr/reports/headcount/pdf?period=last-year&by=project → the report as a PDF download
export async function GET(request, { params }) {
  const { id } = await params
  const report = getReport(id)
  if (!report) return new NextResponse("Report not found", { status: 404 })
  const ctx = await hrContext(`/hrm/reports/${id}`)
  if (!canOpenReport(ctx, report)) return new NextResponse("Not allowed", { status: 403 })
  const result = await runReport(ctx, report, Object.fromEntries(request.nextUrl.searchParams), await reportFilters(ctx))
  const pdf = await renderReportPdf({ report: reportMeta(report), result, brand: await getWorkspaceBrand(ctx.tenant), generatedBy: ctx.user.name })
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reportFileName(report.title)}.pdf"`, "Cache-Control": "private, no-store" } })
}
