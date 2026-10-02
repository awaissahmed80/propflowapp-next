import { crmPage } from "@/modules/crm/server/context"
import { leadContacts } from "@/modules/crm/server/queries"
import { ContactsView } from "@/modules/crm/components/contacts-view"

export const metadata = { title: "Contacts" }

// The people behind the leads this person may see (the Contacts app has everyone else)
export default async function CrmContactsPage() {
  const ctx = await crmPage("/crm/contacts")
  return <ContactsView contacts={await leadContacts(ctx)} scope={ctx.scope} />
}
