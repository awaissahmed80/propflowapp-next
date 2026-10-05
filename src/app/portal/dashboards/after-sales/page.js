import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "After-sales" }

// After-sales: open requests, overdue, transfers / NDC / possession, complaints and on-time share
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="after-sales" searchParams={searchParams} />
}
