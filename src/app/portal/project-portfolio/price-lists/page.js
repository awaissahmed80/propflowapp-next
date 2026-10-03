import { estatePage } from "@/modules/portfolio/server/context"
import { listPriceLists } from "@/modules/portfolio/server/price-list-queries"
import { PriceListsView } from "@/modules/portfolio/components/price-lists-view"

export const metadata = { title: "Price Lists" }

// Every project's price lists: the active one, drafts awaiting activation, and history
export default async function PriceListsPage() {
  const ctx = await estatePage("/project-portfolio/price-lists", "price-lists")
  return <PriceListsView groups={await listPriceLists(ctx)} canEdit={ctx.can("edit")} />
}
