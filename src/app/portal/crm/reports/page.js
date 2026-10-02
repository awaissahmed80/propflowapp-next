import { crmPage } from "@/modules/crm/server/context"
import { REPORTS, REPORT_GROUPS, reportMeta } from "@/modules/crm/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function CrmReportsPage() {
  const ctx = await crmPage("/crm/reports", "reports")
  return (
    <ReportIndex
      description={`Ready-made CRM reports${ctx.scope === "all" ? "" : ctx.scope === "team" ? " on your team's leads" : " on your leads"}. Open one to filter it, then print or download it as PDF or Excel.`}
      groups={REPORT_GROUPS}
      reports={REPORTS.map(reportMeta)}
      basePath="/crm/reports"
    />
  )
}
