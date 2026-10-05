import { contactsPage } from "@/modules/contacts/server/context"
import { contactDuplicates } from "@/modules/contacts/server/queries"
import { contactsNavItem } from "@/modules/contacts/nav"
import { DuplicatesView } from "@/modules/contacts/components/duplicates-view"

const item = contactsNavItem("/contacts/duplicates")
export const metadata = { title: item.label }

// Contacts › Possible duplicates: the same person entered twice, to merge
export default async function DuplicatesPage() {
  const ctx = await contactsPage("/contacts/duplicates", "review")
  return <DuplicatesView groups={await contactDuplicates(ctx)} page={{ title: item.label, description: item.description }} can={{ edit: ctx.can("edit") }} />
}
