import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { SETTINGS_NAV } from "@/modules/settings/nav"

export const metadata = { title: { default: "Settings", template: "%s · Settings · PropFlow" } }

export default async function SettingsLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "settings"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="settings" nav={SETTINGS_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  )
}
