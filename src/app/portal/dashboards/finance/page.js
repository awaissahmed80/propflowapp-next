import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "Collections & finance" }

// Collections & finance: collected vs booked, aging, defaulters, cheques, cash, money in and out, P&L, tax
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="finance" searchParams={searchParams} />
}
