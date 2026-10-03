import { campaignsPage } from "@/modules/campaigns/server/context"
import { campaignSettings } from "@/modules/campaigns/server/settings"
import { captchaSiteKey } from "@/server/captcha"
import { CampaignSettingsView } from "@/modules/campaigns/components/campaign-settings-view"

export const metadata = { title: "Lead forms" }

export default async function CampaignsSettingsPage() {
  const ctx = await campaignsPage("/campaigns/customize/settings")
  return <CampaignSettingsView settings={await campaignSettings(ctx.db)} canEdit={ctx.can("edit")} configured={Boolean(captchaSiteKey())} />
}
