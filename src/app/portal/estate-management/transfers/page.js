import { servicesPage } from "@/modules/estate/server/context"
import { listRequests } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { RequestsView } from "@/modules/estate/components/requests-view"

export const metadata = { title: "Transfers" }

// /services/transfers · transfer requests: seller, purchaser, checklist and fee
export default async function TransfersPage() {
  const nav = servicesNavItem("/estate-management/transfers")
  const ctx = await servicesPage(nav.to, nav.feature)
  const [requests, newRequest] = await Promise.all([listRequests(ctx, { type: "transfer" }), newRequestProps(ctx)])
  return <RequestsView requests={requests} type="transfer" title={nav.label} description={nav.description} me={ctx.user.id} canEdit={ctx.can("edit")} newRequest={newRequest} />
}
