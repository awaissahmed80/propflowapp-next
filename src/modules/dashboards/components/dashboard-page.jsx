import { loadDashboard } from "../server/dashboard"
import { DashboardView } from "./dashboard-view"

// The server half of every dashboard page: works out the cards for the URL's filters
export async function DashboardPage({ dashboard, searchParams }) {
  const data = await loadDashboard(dashboard, await searchParams)
  return <DashboardView data={data} />
}
