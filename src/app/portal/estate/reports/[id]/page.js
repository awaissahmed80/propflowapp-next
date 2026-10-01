import { notFound } from "next/navigation"
import { estatePage } from "@/modules/estate/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/estate/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { ReportView } from "@/components/reports/report-view"

export async function generateMetadata({ params }) {
  return { title: getReport((await params).id)?.title ?? "Report" }
}

// /estate/reports/availability?project=ske
export default async function EstateReportPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await estatePage(`/estate/reports/${id}`, "reports")
  const filters = await reportFilters(ctx)
  const [result, brand] = await Promise.all([runReport(ctx, report, query, filters), getWorkspaceBrand(ctx.tenant)])
  return <ReportView report={reportMeta(report)} result={result} filters={filters} basePath="/estate/reports" pdfBase="/api/estate/reports" brand={brand} userName={ctx.user.name} />
}
