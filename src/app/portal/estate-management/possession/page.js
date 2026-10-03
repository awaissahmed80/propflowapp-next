import { servicesPage } from "@/modules/estate/server/context"
import { listRequests, possessionReady } from "@/modules/estate/server/queries"
import { newRequestProps } from "@/modules/estate/server/new-request"
import { servicesNavItem } from "@/modules/estate/nav"
import { RequestsView } from "@/modules/estate/components/requests-view"
import { PossessionReady } from "@/modules/estate/components/possession-ready"

export const metadata = { title: "Possession" }

// /services/possession · possession requests, and fully paid owners who haven't asked yet
export default async function PossessionPage() {
  const nav = servicesNavItem("/estate-management/possession")
  const ctx = await servicesPage(nav.to, nav.feature)
  const [requests, ready, newRequest] = await Promise.all([listRequests(ctx, { type: "possession" }), possessionReady(ctx), newRequestProps(ctx)])
  return (
    <RequestsView
      requests={requests}
      type="possession"
      title={nav.label}
      description={nav.description}
      me={ctx.user.id}
      canEdit={ctx.can("edit")}
      newRequest={newRequest}
      banner={ready.length > 0 && <PossessionReady owners={ready} canCreate={ctx.can("create")} />}
    />
  )
}
