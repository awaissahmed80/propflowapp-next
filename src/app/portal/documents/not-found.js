import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Documents: keeps the app's sidebar
export default function DocumentsNotFound() {
  return <NotFoundPage full={false} home={{ href: "/documents", label: "Back to Documents" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Documents." />
}
