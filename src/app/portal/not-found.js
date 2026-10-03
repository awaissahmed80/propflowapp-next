import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

export default function PortalNotFound() {
  return (
    <NotFoundPage
      home={{ href: "/", label: "Back to apps" }}
      links={[
        { href: "/", icon: "apps-2-line", label: "Apps", text: "Everything your workspace uses" },
        { href: "/desk", icon: "dashboard-line", label: "My Desk", text: "Your tasks, approvals and messages" },
      ]}
    />
  )
}
