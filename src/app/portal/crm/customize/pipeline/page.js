import { notFound } from "next/navigation"
import { crmPage } from "@/modules/crm/server/context"
import { canEditCrmRules, crmSettings } from "@/modules/crm/server/settings"
import { CrmSettingsView } from "@/modules/settings/crm/crm-settings-view"

export const metadata = { title: "Pipeline & scoring" }

// Pipeline rules and lead scoring, right in CRM (the same page as Settings › CRM)
export default async function CrmAppSettingsPage() {
  const ctx = await crmPage("/crm/customize/pipeline")
  // Setup: locked in the sidebar for people who can't change CRM
  if (!canEditCrmRules(ctx)) notFound()
  return <CrmSettingsView settings={await crmSettings(ctx.db)} canEdit title="Pipeline & scoring" description="Pipeline rules and how leads are scored" />
}
