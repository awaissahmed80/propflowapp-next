import { documentsPage } from "@/modules/documents/server/context"
import { documentsCan, listShareLinks } from "@/modules/documents/server/queries"
import { documentsNavItem } from "@/modules/documents/nav"
import { SharedView } from "@/modules/documents/components/shared-view"

export const metadata = { title: "Shared links" }

// Links to documents shared outside the workspace (feature: sharing)
export default async function SharedLinksPage() {
  const ctx = await documentsPage("/documents/shared", "sharing")
  const links = await listShareLinks(ctx)
  const { label, description } = documentsNavItem("/documents/shared")
  return <SharedView links={links} title={label} description={description} can={documentsCan(ctx)} />
}
