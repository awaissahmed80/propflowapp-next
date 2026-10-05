import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { dashboardsContext } from "@/modules/dashboards/server/context"
import { visibleDashboards } from "@/modules/dashboards/server/cards"
import { DASHBOARDS, dashboardsNav } from "@/modules/dashboards/nav"

export const metadata = { title: { default: "Dashboards", template: "%s · Dashboards · PropFlow" } }

// Dashboards: one per role, each card read through its own app (and that app's access). The
// sidebar locks the dashboards with no card this person may see.
export default async function DashboardsLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  const ctx = portal.apps.some((a) => a.code === "dashboards") ? await dashboardsContext() : null
  if (!ctx?.can("view"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const keys = await visibleDashboards(
    ctx,
    DASHBOARDS.map((d) => d.key),
  )
  return (
    <AppShell portal={portal} appCode="dashboards" nav={dashboardsNav(keys)} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  )
}
