import { notFound } from "next/navigation"
import { crmPage } from "@/modules/crm/server/context"
import { contactDetail } from "@/modules/crm/server/queries"
import { ContactDetail } from "@/modules/crm/components/contact-detail"

export const metadata = { title: "Contact" }

// /crm/contacts/ct-00012: a contact from the central contacts table, as CRM sees them
export default async function CrmContactPage({ params }) {
  const { code } = await params
  const ctx = await crmPage(`/crm/contacts/${code}`)
  const contact = await contactDetail(ctx, code)
  if (!contact) notFound()
  return <ContactDetail contact={contact} />
}
