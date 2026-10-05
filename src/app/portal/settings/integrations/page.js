import { settingsPage } from "@/modules/settings/context"
import { integrationsData } from "@/modules/campaigns/server/meta-queries"
import { IntegrationsView } from "@/modules/campaigns/components/integrations-view"

export const metadata = { title: "Integrations" }

// Settings › Integrations: every third-party connection in one place. Each card follows its own
// app's access (Facebook lead ads: Campaigns › edit), so this page and the app's page stay in sync.
export default async function SettingsIntegrationsPage() {
  await settingsPage("/settings/integrations")
  const { integrations, meta, setup } = await integrationsData()
  return <IntegrationsView integrations={integrations} meta={meta} setup={setup} from="settings" description="Third-party services connected to this workspace: ads, messaging and payments" />
}
