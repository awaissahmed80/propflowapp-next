import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { projectOptions } from "@/modules/campaigns/server/queries"
import { assignableAgents } from "@/modules/crm/server/queries"
import { CampaignForm } from "@/modules/campaigns/components/campaign-form"

export const metadata = { title: "New campaign" }

// A new campaign starts as a draft (or is launched straight away)
export default async function NewCampaignPage() {
  const ctx = await campaignsPage("/campaigns/all/new")
  if (!ctx.can("create")) notFound()
  const [projects, people] = await Promise.all([projectOptions(ctx), assignableAgents(ctx)])
  return <CampaignForm projects={projects} people={people} me={ctx.user.id} />
}
