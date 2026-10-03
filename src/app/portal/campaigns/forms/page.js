import { campaignsPage } from "@/modules/campaigns/server/context"
import { campaignOptions, projectOptions } from "@/modules/campaigns/server/queries"
import { listForms } from "@/modules/campaigns/server/forms"
import { FormsView } from "@/modules/campaigns/components/forms-view"

export const metadata = { title: "Lead Forms" }

// /campaigns/forms · ?new=1 opens the new form dialog
export default async function LeadFormsPage() {
  const ctx = await campaignsPage("/campaigns/forms", "lead-forms")
  const canCreate = ctx.can("create")
  const [forms, campaigns, projects] = await Promise.all([listForms(ctx), canCreate ? campaignOptions(ctx) : [], canCreate ? projectOptions(ctx) : []])
  return <FormsView forms={forms} campaigns={campaigns} projects={projects} canCreate={canCreate} />
}
