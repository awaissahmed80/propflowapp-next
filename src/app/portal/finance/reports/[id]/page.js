import { notFound } from "next/navigation"
import { financePage } from "@/modules/finance/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/finance/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { ReportView } from "@/components/reports/report-view"

export async function generateMetadata({ params }) {
  return { title: getReport((await params).id)?.title ?? "Report" }
}

// /finance/reports/trial-balance?asOf=last-month&project=ske
export default async function FinanceReportPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await financePage(`/finance/reports/${id}`, report.feature ?? null)
  const filters = await reportFilters(ctx)
  const [result, brand] = await Promise.all([runReport(ctx, report, query, filters), getWorkspaceBrand(ctx.tenant)])
  return <ReportView report={reportMeta(report)} result={result} filters={filters} basePath="/finance/reports" pdfBase="/api/finance/reports" brand={brand} userName={ctx.user.name} />
}
