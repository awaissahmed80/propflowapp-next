import { documentsPage } from "@/modules/documents/server/context"
import { documentsCan, listDocuments, projectOptions } from "@/modules/documents/server/queries"
import { documentsNavItem } from "@/modules/documents/nav"
import { DocumentsView } from "@/modules/documents/components/documents-view"

export const metadata = { title: "All documents" }

// Every company document this person may see (types by "Who can see"), newest first
export default async function DocumentsPage() {
  const ctx = await documentsPage("/documents")
  const [docs, projects] = await Promise.all([listDocuments(ctx), projectOptions(ctx)])
  const { label, description } = documentsNavItem("/documents")
  return <DocumentsView docs={docs} title={label} description={description} projects={projects} can={documentsCan(ctx)} />
}
