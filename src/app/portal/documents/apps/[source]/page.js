import { notFound } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { documentsPage } from "@/modules/documents/server/context"
import { listAppFiles } from "@/modules/documents/server/queries"
import { APP_SOURCES } from "@/modules/documents/nav"
import { AppFilesView } from "@/modules/documents/components/app-files-view"

export async function generateMetadata({ params }) {
  const { source } = await params
  return { title: APP_SOURCES.find((s) => s.key === source)?.label ?? "Files" }
}

// Files another app keeps (Project files, Booking files, Landing page images), for people who
// can open them in that app (its record scope too), read-only with a link back to each record
export default async function AppFilesPage({ params }) {
  const { source } = await params
  const ctx = await documentsPage(`/documents/apps/${source}`)
  const src = APP_SOURCES.find((s) => s.key === source)
  if (!src || !(await getPortal()).apps.some((a) => a.code === src.app)) notFound()
  const found = await listAppFiles(ctx, source)
  if (!found) notFound()
  return <AppFilesView key={source} source={{ label: src.label, description: src.description }} files={found.files} />
}
