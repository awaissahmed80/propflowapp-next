import { notFound } from "next/navigation"
import { siteUrl } from "@/lib/sites"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { getCampaign } from "@/modules/campaigns/server/queries"
import { campaignMetaForms } from "@/modules/campaigns/server/meta-queries"
import { CampaignDetail } from "@/modules/campaigns/components/campaign-detail"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// "Skyline Phase 2" → skyline-phase-2, the address a landing page would get by default
const slugify = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)

// /campaigns/all/cmp-0001
export default async function CampaignPage({ params }) {
  const { code } = await params
  const ctx = await campaignsPage(`/campaigns/all/${code}`)
  const campaign = await getCampaign(ctx, code)
  if (!campaign) notFound()
  // Public addresses of its landing pages, for the tracking links
  const pageUrl = (slug) => siteUrl("campaigns", `/${ctx.tenant.slug}/${slug}`)
  const pages = campaign.pages.map((p) => ({ ...p, url: pageUrl(p.slug) }))
  const meta = await campaignMetaForms(ctx, code)
  return <CampaignDetail campaign={{ ...campaign, pages }} meta={meta} baseUrl={pageUrl(slugify(campaign.name))} canEdit={ctx.can("edit")} />
}
