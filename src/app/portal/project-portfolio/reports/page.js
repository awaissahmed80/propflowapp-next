import { estatePage } from "@/modules/portfolio/server/context"
import { REPORTS, REPORT_GROUPS, reportMeta } from "@/modules/portfolio/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function EstateReportsPage() {
  await estatePage("/project-portfolio/reports", "reports")
  return (
    <ReportIndex
      description="Ready-made Project Portfolio reports. Open one to filter it, then print or download it as PDF or Excel."
      groups={REPORT_GROUPS}
      reports={REPORTS.map(reportMeta)}
      basePath="/project-portfolio/reports"
    />
  )
}
