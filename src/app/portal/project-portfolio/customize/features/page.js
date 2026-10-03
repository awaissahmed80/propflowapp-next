import { estatePage } from "@/modules/portfolio/server/context"
import { getListsByKey } from "@/modules/lookups/server"
import { ListCards } from "@/modules/lookups/components/list-cards"

export const metadata = { title: "Premium features" }

// Corner, park-facing… and the default premium each adds to a unit's price
export default async function EstateFeaturesPage() {
  const ctx = await estatePage("/project-portfolio/customize/features")
  const lists = await getListsByKey(ctx.db, ["feature"])
  return <ListCards title="Premium features" description="Features that add a premium to a unit's price, with the default % a price list starts from." lists={lists} canEdit={ctx.can("edit")} />
}
