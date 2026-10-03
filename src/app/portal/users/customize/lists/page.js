import { usersPage } from "@/modules/users/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { SECTION_LISTS } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & labels" }

// Designations, departments and member statuses used in Users & Teams
export default async function ListsPage({ searchParams }) {
  const ctx = await usersPage("/users/customize/lists")
  const lists = await getLookupLists(ctx.db, ["users"]).then((ls) => ls.filter((l) => !SECTION_LISTS.has(l.key)))
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & labels" description="Rename, recolor, reorder and extend the choices your team sees in Users & Teams." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
