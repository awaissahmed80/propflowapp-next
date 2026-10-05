import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "Projects & inventory" }

// Projects & inventory: units by status, stock value, sold share, holds and current rates
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="inventory" searchParams={searchParams} />
}
