import { contactsPage } from "@/modules/contacts/server/context"
import { contactsList } from "@/modules/contacts/server/queries"
import { contactsNavItem } from "@/modules/contacts/nav"
import { ContactsView } from "@/modules/contacts/components/contacts-view"

const item = contactsNavItem("/contacts/all")
export const metadata = { title: item.label }

// Contacts › All contacts
export default async function AllContactsPage() {
  const ctx = await contactsPage("/contacts/all")
  const { rows, total } = await contactsList(ctx, "all")
  return (
    <ContactsView
      rows={rows}
      total={total}
      page={{ title: item.label, empty: "No contacts yet. Leads, bookings and dealers add theirs here, or add one with New contact." }}
      can={{ create: ctx.can("create"), export: ctx.can("export") }}
      workspace={ctx.tenant.name}
      me={ctx.user.name}
    />
  )
}
