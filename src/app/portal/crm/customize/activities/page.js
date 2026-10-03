import { notFound } from "next/navigation"
import { crmPage } from "@/modules/crm/server/context"
import { canEditCrmRules } from "@/modules/crm/server/settings"
import { getListsByKey } from "@/modules/lookups/server"
import { ListCards } from "@/modules/lookups/components/list-cards"

export const metadata = { title: "Activities" }

// What people log on a lead, the points each earns toward the lead score, and how it went
export default async function CrmActivitiesPage() {
  const ctx = await crmPage("/crm/customize/activities")
  if (!canEditCrmRules(ctx)) notFound()
  const lists = await getListsByKey(ctx.db, ["activity-type", "activity-outcome"])
  return <ListCards title="Activities" description="What your team logs on leads, the points each earns toward the lead score, and the outcomes they can pick." lists={lists} canEdit />
}
