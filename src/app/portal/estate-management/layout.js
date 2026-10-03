import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { serviceLists, servicesContext } from "@/modules/estate/server/context"
import { SERVICES_NAV } from "@/modules/estate/nav"

export const metadata = { title: { default: "Estate Management", template: "%s · Estate Management · PropFlow" } }

// Estate Management: transfers, NDCs, possession, documents, record updates and complaints. Pages and actions check permissions themselves.
export default async function ServicesLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "estate"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await servicesContext()
  const lists = await serviceLists(ctx)
  return (
    <AppShell portal={portal} appCode="estate" nav={SERVICES_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="estate" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
