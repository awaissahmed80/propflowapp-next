import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { campaignOptions, projectOptions } from "@/modules/campaigns/server/queries"
import { getForm } from "@/modules/campaigns/server/forms"
import { assignableAgents } from "@/modules/crm/server/queries"
import { FormBuilder } from "@/modules/campaigns/components/form-builder"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// /campaigns/forms/frm-0001: build, set up, share and see the entries of one lead form
export default async function LeadFormPage({ params }) {
  const { code } = await params
  const ctx = await campaignsPage(`/campaigns/forms/${code}`, "lead-forms")
  const form = await getForm(ctx, code)
  if (!form) notFound()
  const canEdit = ctx.can("edit")
  const [campaigns, projects, agents] = await Promise.all([campaignOptions(ctx), projectOptions(ctx), canEdit ? assignableAgents(ctx) : []])
  return <FormBuilder form={form} workspace={ctx.tenant.slug} workspaceName={ctx.tenant.name} campaigns={campaigns} projects={projects} agents={agents.map((a) => ({ id: a.id, name: a.name }))} canEdit={canEdit} />
}
