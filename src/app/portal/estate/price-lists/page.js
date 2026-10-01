import { estatePage } from "@/modules/estate/server/context"
import { listPriceLists } from "@/modules/estate/server/price-list-queries"
import { PriceListsView } from "@/modules/estate/components/price-lists-view"

export const metadata = { title: "Price Lists" }

// Every project's price lists: the active one, drafts awaiting activation, and history
export default async function PriceListsPage() {
  const ctx = await estatePage("/estate/price-lists", "price-lists")
  return <PriceListsView groups={await listPriceLists(ctx)} canEdit={ctx.can("edit")} />
}
