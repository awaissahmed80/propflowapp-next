import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside CRM: keeps the app's sidebar
export default function CrmNotFound() {
  return <NotFoundPage full={false} home={{ href: "/crm", label: "Back to CRM" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into CRM." />
}
