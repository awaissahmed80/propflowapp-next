import { financePage } from "@/modules/finance/server/context"
import { REPORT_GROUPS, availableReports, reportMeta } from "@/modules/finance/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function FinanceReportsPage() {
  const ctx = await financePage("/finance/reports")
  return (
    <ReportIndex
      description="Ready-made Finance reports: the books, buyers and tax. Open one to filter it, then print or download it as PDF or Excel."
      groups={REPORT_GROUPS}
      reports={availableReports(ctx).map(reportMeta)}
      basePath="/finance/reports"
    />
  )
}
