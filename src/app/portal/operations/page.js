import { salesPage } from "@/modules/operations/server/context"
import { salesOverview } from "@/modules/operations/server/queries"
import { SalesOverview } from "@/modules/operations/components/sales-overview"

export const metadata = { title: "Overview" }

// Sales home: bookings, collections and overdue installments for what this person may see
export default async function SalesOverviewPage() {
  const ctx = await salesPage("/operations")
  return <SalesOverview data={await salesOverview(ctx)} />
}
