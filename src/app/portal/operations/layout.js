import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { salesContext } from "@/modules/operations/server/context"
import { salesLists } from "@/modules/operations/server/queries"
import { SALES_NAV } from "@/modules/operations/nav"

export const metadata = { title: { default: "Operations", template: "%s · Operations · PropFlow" } }

// Sales: bookings, payment schedules, receipts and allotments. Pages and actions check sales permissions themselves.
export default async function SalesLayout({ children }) {
  // The app's own context and lists load alongside the portal frame
  const [portal, jar, [ctx, lists]] = await Promise.all([getPortal(), cookies(), salesContext().then((c) => Promise.all([c, salesLists(c)]))])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "operations"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="operations" nav={SALES_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="operations" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
