import { servicesPage } from "@/modules/estate/server/context"
import { listRequests } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { RequestsView } from "@/modules/estate/components/requests-view"

export const metadata = { title: "Complaints" }

// /services/complaints · residents' complaints, as a board by status or a list
export default async function ComplaintsPage() {
  const nav = servicesNavItem("/estate-management/complaints")
  const ctx = await servicesPage(nav.to, nav.feature)
  const [requests, newRequest] = await Promise.all([listRequests(ctx, { type: "complaint" }), newRequestProps(ctx)])
  return <RequestsView requests={requests} type="complaint" title={nav.label} description={nav.description} me={ctx.user.id} board defaultLayout="board" canEdit={ctx.can("edit")} newRequest={newRequest} />
}
