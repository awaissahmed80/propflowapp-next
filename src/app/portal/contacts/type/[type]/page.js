import { notFound } from "next/navigation"
import { contactLists, contactsPage } from "@/modules/contacts/server/context"
import { contactsList } from "@/modules/contacts/server/queries"
import { ContactsView } from "@/modules/contacts/components/contacts-view"

export async function generateMetadata({ params }) {
  const { type } = await params
  return { title: type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ") }
}

// Contacts › By type: everyone marked as one contact type (/contacts/type/customer)
export default async function ContactTypePage({ params }) {
  const { type } = await params
  const ctx = await contactsPage(`/contacts/type/${type}`)
  const def = (await contactLists(ctx))["contact-type"].find((t) => t.value === type)
  if (!def) notFound()
  const { rows, total } = await contactsList(ctx, `type:${type}`)
  return (
    <ContactsView
      rows={rows}
      total={total}
      type={type}
      page={{ title: def.label, empty: `No contacts marked as ${def.label.toLowerCase()}.` }}
      can={{ create: ctx.can("create"), export: ctx.can("export") }}
      workspace={ctx.tenant.name}
      me={ctx.user.name}
    />
  )
}
