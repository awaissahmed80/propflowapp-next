import { usersPage } from "@/modules/users/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & Labels" }

// Designations, departments and member statuses used in Users & Teams
export default async function ListsPage({ searchParams }) {
  const ctx = await usersPage("/users/lists")
  const lists = await getLookupLists(ctx.db, ["users"])
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & Labels" description="Rename, recolour, reorder and extend the choices your team sees in Users & Teams." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
