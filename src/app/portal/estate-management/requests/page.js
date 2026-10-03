import { servicesPage } from "@/modules/estate/server/context"
import { listRequests } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { RequestsView } from "@/modules/estate/components/requests-view"

export const metadata = { title: "Service desk" }

// /services/requests · every request, as a list or a board by status · ?view=overdue, ?new=1
export default async function ServiceDeskPage() {
  const ctx = await servicesPage("/estate-management/requests")
  const nav = servicesNavItem("/estate-management/requests")
  const [requests, newRequest] = await Promise.all([listRequests(ctx), newRequestProps(ctx)])
  return <RequestsView requests={requests} title={nav.label} description={nav.description} me={ctx.user.id} board canEdit={ctx.can("edit")} newRequest={newRequest} />
}
