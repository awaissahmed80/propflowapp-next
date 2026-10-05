import { hrPage } from "@/modules/hr/server/context"
import { hrOverview } from "@/modules/hr/server/employee-queries"
import { HrOverview } from "@/modules/hr/components/hr-overview"

export const metadata = { title: "Overview" }

// HR home: headcount, who's away, leave waiting, this month's payroll and six months of payroll cost
export default async function HrOverviewPage() {
  const ctx = await hrPage("/hrm")
  const data = await hrOverview(ctx)
  return <HrOverview data={data} can={{ leave: ctx.has("leave"), approveLeave: Boolean(ctx.grant("hr.approve-leave")) }} />
}
