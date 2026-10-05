import { estatePage } from "@/modules/portfolio/server/context"
import { activeDealers, listInventory, projectTree } from "@/modules/portfolio/server/queries"
import { InventoryView } from "@/modules/portfolio/components/inventory-view"

export const metadata = { title: "Inventory" }

// Plots, files, houses, apartments and shops. ?project=ske&block=Block A filter on arrival;
// ?unit=ske-0001 opens a unit; ?view=board shows the availability board.
export default async function InventoryPage() {
  const ctx = await estatePage("/project-portfolio/inventory")
  const [units, tree, dealers] = await Promise.all([listInventory(ctx), projectTree(ctx), activeDealers(ctx)])
  return <InventoryView units={units} tree={tree} dealers={dealers} canEdit={ctx.can("edit")} canCreate={ctx.can("create")} canExport={ctx.can("export")} canDelete={ctx.can("delete")} />
}
