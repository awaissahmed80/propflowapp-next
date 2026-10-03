import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Finance: keeps the app's sidebar
export default function FinanceNotFound() {
  return <NotFoundPage full={false} home={{ href: "/finance", label: "Back to Finance" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Finance." />
}
