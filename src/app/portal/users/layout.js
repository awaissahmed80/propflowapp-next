import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { USERS_NAV } from "@/modules/users/nav"

export const metadata = { title: { default: "Users & Teams", template: "%s · Users & Teams · PropFlow" } }

// Users & Teams: people, teams, invitations, roles and the activity log. Pages and actions check
// the person's Users & Teams permissions themselves (modules/users/server/context.js).
export default async function UsersLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "users"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  return (
    <AppShell portal={portal} appCode="users" nav={USERS_NAV} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  )
}
