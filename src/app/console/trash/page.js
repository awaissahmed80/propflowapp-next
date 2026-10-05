import { requireArea } from "@/modules/console/server/access"
import { listDeleted } from "@/modules/console/server/queries"
import { DeletedItemsView } from "@/modules/console/components/deletion"

export const metadata = { title: "Deleted items" }

// Console › Deleted items (platform owner only): restore, or remove for good
export default async function DeletedItemsPage() {
  await requireArea("trash", "/trash")
  return <DeletedItemsView {...await listDeleted()} />
}
