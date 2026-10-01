import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { deskContext } from "@/modules/desk/server/context"
import { deskNav } from "@/modules/desk/nav"

export const metadata = { title: { default: "My Desk", template: "%s · My Desk · PropFlow" } }

// My Desk: everyone's own app (always on, no permission needed)
export default async function DeskLayout({ children }) {
  const [portal, desk, jar] = await Promise.all([getPortal(), deskContext(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  return (
    <AppShell portal={portal} appCode="desk" nav={deskNav({ hasTeam: desk.teams.length > 0 })} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  )
}
