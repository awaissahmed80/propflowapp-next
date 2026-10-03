import { estatePage } from "@/modules/portfolio/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { SECTION_LISTS } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & labels" }

// Project Portfolio's own lists (Settings › Lists & Labels has every app's)
export default async function EstateListsPage({ searchParams }) {
  const ctx = await estatePage("/project-portfolio/customize/lists")
  const lists = await getLookupLists(ctx.db, ["portfolio"]).then((ls) => ls.filter((l) => !SECTION_LISTS.has(l.key)))
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & labels" description="Unit types, statuses, premium features, authorities and other Project Portfolio choices." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
