import { campaignsPage } from "@/modules/campaigns/server/context"
import { campaignActivity } from "@/modules/campaigns/server/queries"
import { CampaignsOverview } from "@/modules/campaigns/components/overview-view"

export const metadata = { title: "Overview" }

// Campaigns home: live campaigns, recent campaign leads, cost per lead by channel, what's next
export default async function CampaignsOverviewPage() {
  const ctx = await campaignsPage("/campaigns")
  return <CampaignsOverview data={await campaignActivity(ctx)} canCreate={ctx.can("create")} />
}
