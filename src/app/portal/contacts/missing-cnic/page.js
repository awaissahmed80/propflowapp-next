import { contactsPage } from "@/modules/contacts/server/context"
import { contactsList } from "@/modules/contacts/server/queries"
import { contactsNavItem } from "@/modules/contacts/nav"
import { ContactsView } from "@/modules/contacts/components/contacts-view"

const item = contactsNavItem("/contacts/missing-cnic")
export const metadata = { title: item.label }

// Contacts › Missing CNIC: customers, owners and tenants with no CNIC on file
export default async function MissingCnicPage() {
  const ctx = await contactsPage("/contacts/missing-cnic", "review")
  const { rows, total } = await contactsList(ctx, "missing-cnic")
  return (
    <ContactsView
      rows={rows}
      total={total}
      page={{
        title: item.label,
        description: rows.length ? `${rows.length} of ${total} contacts need a CNIC` : item.description,
        empty: "Every customer, owner and tenant has a CNIC on file.",
        banner: "Customers, owners and tenants need a CNIC for allotment letters, transfers, NDCs and tenancy police registration. Open a contact and add it with Edit.",
      }}
      can={{ create: false, export: ctx.can("export") }}
      workspace={ctx.tenant.name}
      me={ctx.user.name}
    />
  )
}
