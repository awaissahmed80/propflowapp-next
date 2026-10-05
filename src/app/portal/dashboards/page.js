import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "Executive" }

// Executive: bookings, collections, cash, receivables, stock, leads, after-sales and people
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="executive" searchParams={searchParams} />
}
