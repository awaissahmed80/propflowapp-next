import { notFound } from "next/navigation"
import { crmPage } from "@/modules/crm/server/context"
import { canEditCrmRules } from "@/modules/crm/server/settings"
import { getLookupLists } from "@/modules/lookups/server"
import { SECTION_LISTS } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"

export const metadata = { title: "Lists & labels" }

// CRM's own lists (Settings › Lists & Labels has every app's)
export default async function CrmListsPage({ searchParams }) {
  const ctx = await crmPage("/crm/customize/lists")
  // Setup: locked in the sidebar for people who can't change CRM
  if (!canEditCrmRules(ctx)) notFound()
  const lists = await getLookupLists(ctx.db, ["crm"]).then((ls) => ls.filter((l) => !SECTION_LISTS.has(l.key)))
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & labels" description="Lead statuses, temperature, sources and loss reasons." />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} />
      </div>
    </div>
  )
}
