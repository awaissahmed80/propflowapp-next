import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { campaignLists, campaignsContext } from "@/modules/campaigns/server/context"

export const metadata = { title: { default: "Builder", template: "%s · Campaigns · PropFlow" } }

// Full-width editors (the landing page builder): the portal's top bar, no app sidebar
export default async function BuilderLayout({ children }) {
  const portal = await getPortal()
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "campaigns"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await campaignsContext()
  return (
    <PortalShell portal={portal}>
      <LookupsProvider lists={await campaignLists(ctx)} app="campaigns" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </PortalShell>
  )
}
