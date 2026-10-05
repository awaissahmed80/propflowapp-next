import { notFound, redirect } from "next/navigation"
import { documentsContext, documentsPage } from "@/modules/documents/server/context"
import { documentsCan, findDocument, getDocument, projectOptions } from "@/modules/documents/server/queries"
import { DocumentDetail } from "@/modules/documents/components/document-detail"

export async function generateMetadata({ params }) {
  const { code } = await params
  const ctx = await documentsContext(`/documents/${code}`)
  return { title: ctx.can("view") ? ((await findDocument(ctx, code))?.title ?? "Document") : "Document" }
}

// /documents/<asset code>: one company document with its versions and share links. An earlier
// version's code opens the document at its current version.
export default async function DocumentPage({ params }) {
  const { code } = await params
  const ctx = await documentsPage(`/documents/${code}`)
  const found = await getDocument(ctx, code)
  if (!found) notFound()
  if (found.current !== String(code).toLowerCase()) redirect(`/documents/${found.current}`)
  const projects = await projectOptions(ctx)
  return <DocumentDetail key={found.doc.code} doc={found.doc} versions={found.versions} links={found.links} projects={projects} can={documentsCan(ctx)} />
}
