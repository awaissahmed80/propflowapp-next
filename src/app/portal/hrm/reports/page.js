import { hrPage } from "@/modules/hr/server/context"
import { REPORT_GROUPS, availableReports, reportMeta } from "@/modules/hr/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function HrReportsPage() {
  const ctx = await hrPage("/hrm/reports")
  const reports = availableReports(ctx).map(reportMeta)
  return (
    <ReportIndex
      description="Ready-made HR reports: headcount, payroll, tax, EOBI, leave and attendance. Open one to filter it, then print or download it as PDF or Excel."
      groups={REPORT_GROUPS.filter((g) => reports.some((r) => r.group === g))}
      reports={reports}
      basePath="/hrm/reports"
    />
  )
}
