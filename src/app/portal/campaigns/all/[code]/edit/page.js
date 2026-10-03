import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { getCampaign, projectOptions } from "@/modules/campaigns/server/queries"
import { assignableAgents } from "@/modules/crm/server/queries"
import { CampaignForm } from "@/modules/campaigns/components/campaign-form"

export async function generateMetadata({ params }) {
  return { title: `Edit ${String((await params).code).toUpperCase()}` }
}

// /campaigns/all/cmp-0001/edit
export default async function EditCampaignPage({ params }) {
  const { code } = await params
  const ctx = await campaignsPage(`/campaigns/all/${code}/edit`)
  if (!ctx.can("edit")) notFound()
  const [campaign, projects, people] = await Promise.all([getCampaign(ctx, code), projectOptions(ctx), assignableAgents(ctx)])
  if (!campaign) notFound()
  return <CampaignForm campaign={campaign} projects={projects} people={people} me={ctx.user.id} />
}
