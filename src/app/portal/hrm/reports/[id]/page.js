import { notFound } from "next/navigation"
import { hrPage } from "@/modules/hr/server/context"
import { canOpenReport, getReport, reportFilters, reportMeta, runReport } from "@/modules/hr/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { ReportView } from "@/components/reports/report-view"

export async function generateMetadata({ params }) {
  return { title: getReport((await params).id)?.title ?? "Report" }
}

// /hrm/reports/salary-tax?period=last-tax-year
export default async function HrReportPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await hrPage(`/hrm/reports/${id}`)
  if (!canOpenReport(ctx, report)) notFound()
  const filters = await reportFilters(ctx)
  const [result, brand] = await Promise.all([runReport(ctx, report, query, filters), getWorkspaceBrand(ctx.tenant)])
  return <ReportView report={reportMeta(report)} result={result} filters={filters} basePath="/hrm/reports" pdfBase="/api/hr/reports" brand={brand} userName={ctx.user.name} />
}
