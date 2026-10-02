import { crmPage } from "@/modules/crm/server/context"
import { crmProjects, plannedWork } from "@/modules/crm/server/queries"
import { MeetingsView } from "@/modules/crm/components/planned-views"

export const metadata = { title: "Meetings" }

// Office meetings planned on leads, by day, with the last 30 days' show-up rate
export default async function CrmMeetingsPage() {
  const ctx = await crmPage("/crm/meetings")
  const [items, projects] = await Promise.all([plannedWork(ctx, "meetings"), crmProjects(ctx)])
  return <MeetingsView items={items} projects={projects} canEdit={ctx.can("edit")} />
}
