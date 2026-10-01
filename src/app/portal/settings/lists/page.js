import { getLookupLists } from "@/modules/lookups/server"
import { settingsPage } from "@/modules/settings/context"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & Labels" }

// Every app's pick-lists in one place, grouped by app (each app's Setup shows just its own)
export default async function AllListsPage({ searchParams }) {
  const ctx = await settingsPage("/settings/lists")
  const lists = await getLookupLists(ctx.db)
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & Labels" description="Rename, recolour, reorder and extend the choices your team sees across the workspace." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
