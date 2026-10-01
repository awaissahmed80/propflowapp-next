import { cookies } from "next/headers"
import { requireStaff } from "@/server/auth/dal"
import { navCounts } from "@/modules/console/server/queries"
import { getSiteSettings } from "@/server/platform-settings"
import { PLATFORM_ROLES, can, roleLabel } from "@/modules/console/roles"
import { ConsoleShell } from "@/modules/console/components/shell"

export const metadata = { title: { default: "Console", template: "%s · PropFlow Console" } }

// console.<domain>: the platform console for the PropFlow team. Every page and action also
// checks access itself, because layouts don't re-run on client navigation.
export default async function ConsoleLayout({ children }) {
  const staff = await requireStaff()
  const [counts, jar, site] = await Promise.all([navCounts(staff.role), cookies(), getSiteSettings()])
  return (
    <ConsoleShell
      user={{ name: staff.user.name, email: staff.user.email, avatarUrl: staff.user.avatarUrl }}
      roleLabel={roleLabel(staff.role)}
      areas={PLATFORM_ROLES[staff.role].view}
      counts={counts}
      maintenance={site.maintenance}
      canChangeSettings={can(staff.role, "settings")}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {children}
    </ConsoleShell>
  )
}
