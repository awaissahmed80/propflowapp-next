import { estatePage } from "@/modules/estate/server/context"
import { REPORTS, REPORT_GROUPS, reportMeta } from "@/modules/estate/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function EstateReportsPage() {
  await estatePage("/estate/reports", "reports")
  return (
    <ReportIndex
      description="Ready-made Estate Management reports. Open one to filter it, then print or download it as PDF or Excel."
      groups={REPORT_GROUPS}
      reports={REPORTS.map(reportMeta)}
      basePath="/estate/reports"
    />
  )
}
