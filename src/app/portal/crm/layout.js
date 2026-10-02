import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { crmContext } from "@/modules/crm/server/context"
import { crmLists } from "@/modules/crm/server/queries"
import { canEditCrmRules } from "@/modules/crm/server/settings"
import { crmNav } from "@/modules/crm/nav"

export const metadata = { title: { default: "CRM", template: "%s · CRM · PropFlow" } }

// CRM: leads and what happens with them. Pages and actions check CRM permissions themselves.
export default async function CrmLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "crm"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await crmContext()
  const lists = await crmLists(ctx)
  return (
    <AppShell portal={portal} appCode="crm" nav={crmNav(canEditCrmRules(ctx))} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="crm" canAdd={ctx.can("edit") || ctx.can("create")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
