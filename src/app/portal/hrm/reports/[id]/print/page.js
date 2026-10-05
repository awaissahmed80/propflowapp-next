import { notFound } from "next/navigation"
import { hrPage } from "@/modules/hr/server/context"
import { canOpenReport, getReport, reportFilters, reportMeta, runReport } from "@/modules/hr/server/reports"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { ReportDocument } from "@/components/reports/report-document"

export const metadata = { title: "Print report" }

// A report as it prints, for the preview's Print button (opens the print dialog on load)
export default async function HrReportPrintPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const report = getReport(id)
  if (!report) notFound()
  const ctx = await hrPage(`/hrm/reports/${id}`)
  if (!canOpenReport(ctx, report)) notFound()
  const result = await runReport(ctx, report, query, await reportFilters(ctx))
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <ReportDocument report={reportMeta(report)} result={result} brand={await getWorkspaceBrand(ctx.tenant)} generatedBy={ctx.user.name} />
      <PrintOnLoad />
    </div>
  )
}
