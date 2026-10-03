import { estatePage } from "@/modules/portfolio/server/context"
import { getListsByKey } from "@/modules/lookups/server"
import { ListCards } from "@/modules/lookups/components/list-cards"

export const metadata = { title: "Units & sizes" }

// How units are typed and sized: unit types, what each block category holds, and area units
export default async function EstateUnitsPage() {
  const ctx = await estatePage("/project-portfolio/customize/units")
  const lists = await getListsByKey(ctx.db, ["unit-type", "block-category", "area-unit"])
  return <ListCards title="Units & sizes" description="Unit types and how they're measured, what each block category holds, and the area units sizes are entered in." lists={lists} canEdit={ctx.can("edit")} />
}
