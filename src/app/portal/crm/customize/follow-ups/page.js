import { notFound } from "next/navigation"
import { crmPage } from "@/modules/crm/server/context"
import { canEditCrmRules } from "@/modules/crm/server/settings"
import { getListsByKey } from "@/modules/lookups/server"
import { ListCards } from "@/modules/lookups/components/list-cards"

export const metadata = { title: "Follow-ups & replies" }

// When the next follow-up lands, and the ready-made texts people tap while logging
export default async function CrmFollowUpsPage() {
  const ctx = await crmPage("/crm/customize/follow-ups")
  if (!canEditCrmRules(ctx)) notFound()
  const lists = await getListsByKey(ctx.db, ["follow-up", "quick-reply"])
  return <ListCards title="Follow-ups & replies" description="Follow-up options with how many days ahead they land, and quick replies people tap while logging." lists={lists} canEdit />
}
