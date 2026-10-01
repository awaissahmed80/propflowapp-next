import { requireArea } from "@/modules/console/server/access"
import { getSiteSettings } from "@/server/platform-settings"
import { platformDb } from "@/server/db/connections"
import { can } from "@/modules/console/roles"
import { SettingsView } from "@/modules/console/components/settings-view"

export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const staff = await requireArea("settings", "/settings")
  const [site, changed] = await Promise.all([getSiteSettings(), platformDb()("settings").whereIn("key", ["site_status", "signup_mode", "prices_visible"]).max({ at: "updatedAt" }).first()])
  return <SettingsView site={site} updatedAt={changed?.at ?? null} editable={can(staff.role, "settings")} />
}
