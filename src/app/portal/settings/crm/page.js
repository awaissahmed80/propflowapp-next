import { settingsPage } from "@/modules/settings/context"
import { crmContext } from "@/modules/crm/server/context"
import { canEditCrmRules, crmSettings } from "@/modules/crm/server/settings"
import { CrmSettingsView } from "@/modules/settings/crm/crm-settings-view"

export const metadata = { title: "CRM" }

// How leads are worked in this workspace (also in CRM › Settings)
export default async function CrmSettingsPage() {
  const ctx = await settingsPage("/settings/crm")
  return <CrmSettingsView settings={await crmSettings(ctx.db)} canEdit={canEditCrmRules(await crmContext("/settings/crm"))} />
}
