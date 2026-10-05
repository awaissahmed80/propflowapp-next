import { campaignsPage } from "@/modules/campaigns/server/context"
import { integrationsData } from "@/modules/campaigns/server/meta-queries"
import { IntegrationsView } from "@/modules/campaigns/components/integrations-view"

export const metadata = { title: "Integrations" }

// Campaigns › Integrations: Facebook & Instagram lead ads (also in Settings › Integrations)
export default async function CampaignsIntegrationsPage() {
  await campaignsPage("/campaigns/integrations")
  const { integrations, meta, setup } = await integrationsData()
  return <IntegrationsView integrations={integrations} meta={meta} setup={setup} from="campaigns" />
}
