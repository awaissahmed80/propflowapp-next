import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/campaigns/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { ReportView } from "@/components/reports/report-view"

export async function generateMetadata({ params }) {
  return { title: getReport((await params).id)?.title ?? "Report" }
}

// /campaigns/reports/sources?period=this-month&project=ske
export default async function CampaignsReportPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await campaignsPage(`/campaigns/reports/${id}`)
  const filters = await reportFilters(ctx)
  const [result, brand] = await Promise.all([runReport(ctx, report, query, filters), getWorkspaceBrand(ctx.tenant)])
  return <ReportView report={reportMeta(report)} result={result} filters={filters} basePath="/campaigns/reports" pdfBase="/api/campaigns/reports" brand={brand} userName={ctx.user.name} />
}
