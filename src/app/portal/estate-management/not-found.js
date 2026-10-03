import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Estate Management: keeps the app's sidebar
export default function ServicesNotFound() {
  return (
    <NotFoundPage
      full={false}
      home={{ href: "/estate-management", label: "Back to Estate Management" }}
      text="It may have been removed, or it isn't yours to see. Check the address, or head back into Estate Management."
    />
  )
}
