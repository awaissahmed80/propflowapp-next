import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { financeLists, financeContext } from "@/modules/finance/server/context"
import { FINANCE_NAV } from "@/modules/finance/nav"

export const metadata = { title: { default: "Finance", template: "%s · Finance · PropFlow" } }

// Finance: vouchers, receipts and cheques, refunds, vendors, payment requests and the books. Pages and actions check permissions themselves.
export default async function FinanceLayout({ children }) {
  // The app's own context and lists load alongside the portal frame
  const [portal, jar, [ctx, lists]] = await Promise.all([getPortal(), cookies(), financeContext().then((c) => Promise.all([c, financeLists(c)]))])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "finance"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="finance" nav={FINANCE_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="finance" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
