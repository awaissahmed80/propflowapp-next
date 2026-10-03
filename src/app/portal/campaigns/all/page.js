import { campaignsPage } from "@/modules/campaigns/server/context"
import { listCampaigns } from "@/modules/campaigns/server/queries"
import { CampaignsView } from "@/modules/campaigns/components/campaigns-view"

export const metadata = { title: "Campaigns" }

// Every campaign with its spend, leads and cost per lead
export default async function CampaignsListPage() {
  const ctx = await campaignsPage("/campaigns/all")
  return <CampaignsView campaigns={await listCampaigns(ctx)} canCreate={ctx.can("create")} />
}
