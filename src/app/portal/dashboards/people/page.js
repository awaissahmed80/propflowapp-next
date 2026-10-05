import { DashboardPage } from "@/modules/dashboards/components/dashboard-page"

export const metadata = { title: "People" }

// People: headcount, who's away, leave waiting, attendance, payroll cost and loans
export default function Page({ searchParams }) {
  return <DashboardPage dashboard="people" searchParams={searchParams} />
}
