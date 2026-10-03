import { notFound } from "next/navigation"
import { campaignsPage } from "@/modules/campaigns/server/context"
import { getPage } from "@/modules/campaigns/server/pages"
import { PageEditor } from "@/modules/campaigns/components/page-editor"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// /campaigns/pages/lp-0001: the landing page builder
export default async function LandingPageEditorPage({ params }) {
  const { code } = await params
  const ctx = await campaignsPage(`/campaigns/pages/${code}`, "landing-pages")
  const data = await getPage(ctx, code)
  if (!data) notFound()
  return <PageEditor data={data} canEdit={ctx.can("edit")} />
}
