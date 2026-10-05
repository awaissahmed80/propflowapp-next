import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "Sales & marketing" }

// Sales & marketing: leads, pipeline, sources, conversion, response time, campaigns and bookings
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="sales" searchParams={searchParams} />
}
