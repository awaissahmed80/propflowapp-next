import { notFound } from "next/navigation"
import { contactLists, contactsPage } from "@/modules/contacts/server/context"
import { contactDetail, detailLists } from "@/modules/contacts/server/queries"
import { crmContext } from "@/modules/crm/server/context"
import { LookupsProvider } from "@/modules/lookups/context"
import { ContactDetail } from "@/modules/contacts/components/contact-detail"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// /contacts/ct-00012: one contact and everything linked to them
export default async function ContactPage({ params }) {
  const { code } = await params
  const ctx = await contactsPage(`/contacts/${code}`)
  const contact = await contactDetail(ctx, code)
  if (!contact) notFound()
  const [lists, extra, crm] = await Promise.all([contactLists(ctx), detailLists(ctx), crmContext()])
  return (
    <LookupsProvider lists={{ ...lists, ...extra }} app="contacts" canAdd={ctx.can("edit")}>
      <ContactDetail contact={contact} can={{ edit: ctx.can("edit"), delete: ctx.can("delete"), newLead: crm.can("create") }} />
    </LookupsProvider>
  )
}
