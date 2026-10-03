import { campaignsPage } from "@/modules/campaigns/server/context"
import { ComingSoon } from "@/components/coming-soon"

export const metadata = { title: "Integrations" }

export default async function CampaignsIntegrationsPage() {
  await campaignsPage("/campaigns/integrations")
  return <ComingSoon title="Integrations" description="Meta lead ads, Google Ads and SMS gateways" icon="plug-line" />
}
