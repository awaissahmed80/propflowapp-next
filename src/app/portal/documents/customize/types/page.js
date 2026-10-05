import { documentsPage } from "@/modules/documents/server/context"
import { getListsByKey } from "@/modules/lookups/server"
import { ListCards } from "@/modules/lookups/components/list-cards"

export const metadata = { title: "Document types" }

// How company documents are filed, and who can see each kind (also in Settings › App Settings)
export default async function DocumentTypesPage() {
  const ctx = await documentsPage("/documents/customize/types")
  const lists = await getListsByKey(ctx.db, ["document-type"])
  return (
    <ListCards
      title="Document types"
      description="Each type is a folder in the sidebar. Who can see sets which roles may open its documents; buyer, HR and finance types can never be shared outside the workspace."
      lists={lists}
      canEdit={ctx.can("edit")}
    />
  )
}
