import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { campaignLists, campaignsContext } from "@/modules/campaigns/server/context"
import { CAMPAIGNS_NAV } from "@/modules/campaigns/nav"

export const metadata = { title: { default: "Campaigns", template: "%s · Campaigns · PropFlow" } }

// Campaigns: launches and drives, lead forms and landing pages. Pages and actions check permissions themselves.
export default async function CampaignsLayout({ children }) {
  // The app's own context and lists load alongside the portal frame
  const [portal, jar, [ctx, lists]] = await Promise.all([getPortal(), cookies(), campaignsContext().then((c) => Promise.all([c, campaignLists(c)]))])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "campaigns"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="campaigns" nav={CAMPAIGNS_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="campaigns" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
