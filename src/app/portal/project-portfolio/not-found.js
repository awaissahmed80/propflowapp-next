import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Project Portfolio: keeps the app's sidebar
export default function EstateNotFound() {
  return (
    <NotFoundPage
      full={false}
      home={{ href: "/project-portfolio", label: "Back to Project Portfolio" }}
      text="It may have been removed, or it isn't yours to see. Check the address, or head back into Project Portfolio."
    />
  )
}
