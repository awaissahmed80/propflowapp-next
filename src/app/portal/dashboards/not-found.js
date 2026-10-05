import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Dashboards: keeps the app's sidebar
export default function DashboardsNotFound() {
  return <NotFoundPage full={false} home={{ href: "/", label: "Back to all apps" }} text="This dashboard isn't in your workspace, or your role has nothing on it to show. Check the address, or pick another dashboard." />
}
