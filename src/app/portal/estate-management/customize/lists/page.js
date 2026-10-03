import { servicesPage } from "@/modules/estate/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { SECTION_LISTS } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & labels" }

// Estate Management's own lists (Settings › Lists & Labels has every app's)
export default async function EstateListsPage({ searchParams }) {
  const ctx = await servicesPage("/estate-management/customize/lists")
  const lists = await getLookupLists(ctx.db, ["estate"]).then((ls) => ls.filter((l) => !SECTION_LISTS.has(l.key)))
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & labels" description="Request types and statuses, complaint priorities and categories, documents on request and how requests come in." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} canEdit={ctx.can("edit")} />
      </div>
    </div>
  )
}
