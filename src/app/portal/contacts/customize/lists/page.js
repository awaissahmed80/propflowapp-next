import { contactsPage } from "@/modules/contacts/server/context"
import { getListsByKey } from "@/modules/lookups/server"
import { can, isFullAccess } from "@/modules/users/permissions"
import { PageHeader } from "@/components/page-header"
import { LookupEditor } from "@/modules/lookups/components/lookup-editor"
import { contactsNavItem } from "@/modules/contacts/nav"

export const metadata = { title: "Lists & labels" }

// Contact types and cities. Both are General lists shared by every app (CRM, Operations, Estate
// Management…), so changing them takes Settings access, as in Settings › Lists & Labels.
export default async function ContactListsPage({ searchParams }) {
  const ctx = await contactsPage("/contacts/customize/lists")
  const lists = await getListsByKey(ctx.db, ["contact-type", "city"])
  const canEdit = isFullAccess(ctx.permissions) || can(ctx.permissions, "settings", "edit")
  return (
    <div className="flex h-[calc(100svh-3.5rem-var(--sub-nav,0px))] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Lists & labels"
        description={`${contactsNavItem("/contacts/customize").description}. ${canEdit ? "Changes apply in every app." : "Changing them needs Settings access, as they're used in every app."}`}
      />
      <div className="min-h-0 flex-1">
        <LookupEditor lists={lists} initialKey={(await searchParams).list} canEdit={canEdit} />
      </div>
    </div>
  )
}
