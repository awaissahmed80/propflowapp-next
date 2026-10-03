import { campaignsPage } from "@/modules/campaigns/server/context"
import { listPages } from "@/modules/campaigns/server/pages"
import { campaignOptions, projectOptions } from "@/modules/campaigns/server/queries"
import { formOptions } from "@/modules/campaigns/server/forms"
import { PagesView } from "@/modules/campaigns/components/pages-view"

export const metadata = { title: "Landing pages" }

// ?new=1 opens "New landing page"
export default async function LandingPagesPage({ searchParams }) {
  const ctx = await campaignsPage("/campaigns/pages", "landing-pages")
  const [pages, campaigns, projects, forms] = await Promise.all([listPages(ctx), campaignOptions(ctx), projectOptions(ctx), formOptions(ctx)])
  return (
    <PagesView
      pages={pages}
      options={{ campaigns, projects: projects.map((p) => ({ value: p.code, label: p.name })), forms }}
      workspace={{ name: ctx.tenant.name, slug: ctx.tenant.slug }}
      canCreate={ctx.can("create")}
      canEdit={ctx.can("edit")}
      canDelete={ctx.can("delete")}
      startNew={(await searchParams).new === "1" && ctx.can("create")}
    />
  )
}
