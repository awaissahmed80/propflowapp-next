import { crmPage } from "@/modules/crm/server/context"
import { plannedWork } from "@/modules/crm/server/queries"
import { FollowUpsView } from "@/modules/crm/components/planned-views"

export const metadata = { title: "Follow-ups" }

// The follow-ups planned on leads (not site visits), overdue first
export default async function CrmFollowUpsPage() {
  const ctx = await crmPage("/crm/follow-ups")
  return <FollowUpsView items={await plannedWork(ctx, "follow-ups")} me={ctx.user.id} scope={ctx.scope} canEdit={ctx.can("edit")} />
}
