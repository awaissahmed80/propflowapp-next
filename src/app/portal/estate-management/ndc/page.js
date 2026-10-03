import { servicesPage } from "@/modules/estate/server/context"
import { listRequests } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { RequestsView } from "@/modules/estate/components/requests-view"

export const metadata = { title: "NDC" }

// /services/ndc · NDC requests and the certificates issued
export default async function NdcPage() {
  const nav = servicesNavItem("/estate-management/ndc")
  const ctx = await servicesPage(nav.to, nav.feature)
  const [requests, newRequest] = await Promise.all([listRequests(ctx, { type: "ndc" }), newRequestProps(ctx)])
  return <RequestsView requests={requests} type="ndc" title={nav.label} description={nav.description} me={ctx.user.id} canEdit={ctx.can("edit")} newRequest={newRequest} />
}
