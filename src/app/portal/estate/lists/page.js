import { estatePage } from "@/modules/estate/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & Labels" }

// Estate Management's own lists (Settings › Lists & Labels has every app's)
export default async function EstateListsPage({ searchParams }) {
  const ctx = await estatePage("/estate/lists")
  const lists = await getLookupLists(ctx.db, ["estate"])
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & Labels" description="Unit types, statuses, premium features, authorities and other Estate Management choices." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
