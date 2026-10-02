import { crmPage } from "@/modules/crm/server/context"
import { crmProjects, plannedWork } from "@/modules/crm/server/queries"
import { SiteVisitsView } from "@/modules/crm/components/planned-views"

export const metadata = { title: "Site visits" }

// Site visits planned on leads, by day, with the last 30 days' show-up rate
export default async function CrmSiteVisitsPage() {
  const ctx = await crmPage("/crm/site-visits")
  const [items, projects] = await Promise.all([plannedWork(ctx, "site-visits"), crmProjects(ctx)])
  return <SiteVisitsView items={items} projects={projects} canEdit={ctx.can("edit")} />
}
