import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Contacts: keeps the app's sidebar
export default function ContactsNotFound() {
  return <NotFoundPage full={false} home={{ href: "/contacts", label: "Back to Contacts" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Contacts." />
}
