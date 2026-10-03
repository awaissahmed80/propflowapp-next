import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { getReport, reportFilters, reportMeta, runReport } from "@/modules/campaigns/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { ReportDocument } from "@/components/reports/report-document"

export const metadata = { title: "Print report" }

// A report as it prints, for the preview's Print button (opens the print dialog on load)
export default async function CampaignsReportPrintPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await campaignsPage(`/campaigns/reports/${id}`)
  const result = await runReport(ctx, report, query, await reportFilters(ctx))
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <ReportDocument report={reportMeta(report)} result={result} brand={await getWorkspaceBrand(ctx.tenant)} generatedBy={ctx.user.name} />
      <PrintOnLoad />
    </div>
  )
}
