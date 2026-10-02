import { crmPage } from "@/modules/crm/server/context"
import { crmOverview } from "@/modules/crm/server/overview"
import { OverviewView } from "@/modules/crm/components/overview-view"

export const metadata = { title: "Overview" }

// CRM home: the pipeline at a glance, for the leads this person may see
export default async function CrmOverviewPage() {
  const ctx = await crmPage("/crm")
  return <OverviewView data={await crmOverview(ctx)} me={ctx.user.id} canCreate={ctx.can("create")} />
}
