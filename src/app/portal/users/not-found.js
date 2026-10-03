import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Users & Teams: keeps the app's sidebar
export default function UsersNotFound() {
  return <NotFoundPage full={false} home={{ href: "/users", label: "Back to Users & Teams" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Users & Teams." />
}
