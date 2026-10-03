import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Sales: keeps the app's sidebar
export default function SalesNotFound() {
  return <NotFoundPage full={false} home={{ href: "/operations", label: "Back to Operations" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Operations." />
}
