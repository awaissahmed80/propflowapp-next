import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { hrLists, hrContext } from "@/modules/hr/server/context"
import { HR_NAV } from "@/modules/hr/nav"

export const metadata = { title: { default: "HR & Payroll", template: "%s · HR & Payroll · PropFlow" } }

// HR & Payroll: employees, leave, duty roster and attendance, loans and payroll. Pages and actions check permissions themselves.
export default async function HrLayout({ children }) {
  // The app's own context and lists load alongside the portal frame
  const [portal, jar, [ctx, lists]] = await Promise.all([getPortal(), cookies(), hrContext().then((c) => Promise.all([c, hrLists(c)]))])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "hr"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="hr" nav={HR_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="hr" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
