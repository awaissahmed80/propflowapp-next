import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { estateContext } from "@/modules/portfolio/server/context"
import { estateLists } from "@/modules/portfolio/server/queries"
import { ESTATE_NAV } from "@/modules/portfolio/nav"

export const metadata = { title: { default: "Project Portfolio", template: "%s · Project Portfolio · PropFlow" } }

// Project Portfolio: projects and inventory. Pages and actions check estate permissions themselves.
export default async function EstateLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "portfolio"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await estateContext()
  const lists = await estateLists(ctx)
  return (
    <AppShell portal={portal} appCode="portfolio" nav={ESTATE_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="portfolio" canAdd={ctx.can("edit") || ctx.can("create")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
