import { campaignsPage } from "@/modules/campaigns/server/context"
import { REPORTS, REPORT_GROUPS, reportMeta } from "@/modules/campaigns/server/reports"
import { ReportIndex } from "@/components/reports/report-index"

export const metadata = { title: "Reports" }

export default async function CampaignsReportsPage() {
  const ctx = await campaignsPage("/campaigns/reports")
  return (
    <ReportIndex description="Ready-made Campaigns reports. Open one to filter it, then print or download it as PDF or Excel." groups={REPORT_GROUPS} reports={REPORTS.map(reportMeta)} basePath="/campaigns/reports" />
  )
}
