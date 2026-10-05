import { contactsPage } from "@/modules/contacts/server/context"
import { contactsOverview } from "@/modules/contacts/server/queries"
import { contactsNavItem } from "@/modules/contacts/nav"
import { ContactsOverview } from "@/modules/contacts/components/overview-view"

export const metadata = { title: contactsNavItem("/contacts").label }

// Contacts › Overview: the directory at a glance
export default async function ContactsOverviewPage() {
  const ctx = await contactsPage("/contacts")
  return <ContactsOverview data={await contactsOverview(ctx)} can={{ create: ctx.can("create"), review: ctx.has("review") }} />
}
