import { notFound } from "next/navigation"
import { documentsContext, documentsPage } from "@/modules/documents/server/context"
import { documentsCan, listDocuments, projectOptions } from "@/modules/documents/server/queries"
import { DocumentsView } from "@/modules/documents/components/documents-view"

const typeOf = (ctx, value) => ctx.types.find((t) => t.value === value && ctx.canSeeType(t.value))

export async function generateMetadata({ params }) {
  const { type } = await params
  const ctx = await documentsContext(`/documents/type/${type}`)
  return { title: typeOf(ctx, type)?.label ?? "Page not found" }
}

// One document type from the sidebar (Approvals & NOCs, Agreements…); types the person may not
// see don't exist for them
export default async function DocumentTypePage({ params }) {
  const { type } = await params
  const ctx = await documentsPage(`/documents/type/${type}`)
  const t = typeOf(ctx, type)
  if (!t) notFound()
  const [docs, projects] = await Promise.all([listDocuments(ctx, { type: t.value }), projectOptions(ctx)])
  const ACCESS = {
    everyone: "Everyone can see these, dealers too",
    staff: "Staff can see these (not dealers)",
    buyers: "Only people who see full CNICs can see these",
    hr: "Only people who see salaries can see these",
    finance: "Only Finance users can see these",
  }
  return <DocumentsView key={t.value} docs={docs} type={t.value} title={t.label} description={ACCESS[t.meta?.access ?? "staff"]} projects={projects} can={documentsCan(ctx)} />
}
