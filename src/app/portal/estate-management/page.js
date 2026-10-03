import { servicesPage } from "@/modules/estate/server/context"
import { serviceOverview } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { ServicesOverview } from "@/modules/estate/components/overview-view"

export const metadata = { title: "Overview" }

// Estate Management home: open and overdue requests, complaints, transfers and recent work
export default async function ServicesOverviewPage() {
  const ctx = await servicesPage("/estate-management")
  const [data, newRequest] = await Promise.all([serviceOverview(ctx), newRequestProps(ctx)])
  return <ServicesOverview data={data} title="Estate Management" description={servicesNavItem("/estate-management").description} newRequest={newRequest} />
}
