import { salesPage } from "@/modules/operations/server/context"
import { REPORTS, reportProjects, salesReport } from "@/modules/operations/server/reports"
import { SalesReportsView } from "@/modules/operations/components/sales-reports-view"

export const metadata = { title: "Reports" }

// ?r=aging&project=lc2&from=2026-07-01&to=2026-09-30 (the report, its project and period)
export default async function SalesReportsPage({ searchParams }) {
  const ctx = await salesPage("/operations/reports")
  const q = await searchParams
  const report = REPORTS.find((r) => r.key === q.r) ?? REPORTS[0]
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : null)
  const filters = { project: q.project ? String(q.project).toUpperCase() : null, from: report.period ? day(q.from) : null, to: report.period ? day(q.to) : null }
  const [data, projects] = await Promise.all([salesReport(ctx, report.key, filters), reportProjects(ctx)])
  return <SalesReportsView reports={REPORTS} report={report} data={data} projects={projects} filters={{ ...filters, preset: q.period ?? null }} />
}
