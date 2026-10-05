import { hrPage } from "@/modules/hr/server/context"
import { getListsByKey } from "@/modules/lookups/server"
import { SECTION_LISTS } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & labels" }

// HR's lists, with the designations and departments it shares with Users & Teams (Settings ›
// Lists & Labels has every app's)
const LISTS = ["leave-type", "employment-type", "post-kind", "designation", "department"]

export default async function HrListsPage({ searchParams }) {
  const ctx = await hrPage("/hrm/customize/lists")
  const lists = (await getListsByKey(ctx.db, LISTS)).filter((l) => !SECTION_LISTS.has(l.key))
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & labels" description="Leave types, employment types, duty post kinds, designations and departments." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} canEdit={ctx.can("edit")} />
      </div>
    </div>
  )
}
