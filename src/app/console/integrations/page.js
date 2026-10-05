import { requireArea } from "@/modules/console/server/access"
import { can } from "@/modules/console/roles"
import { platformIntegrations } from "@/modules/console/server/integrations"
import { PlatformIntegrations } from "@/modules/console/components/integrations-admin"

export const metadata = { title: "Integrations" }

// Console › Integrations: each integration live, coming soon or hidden for every workspace
export default async function ConsoleIntegrationsPage() {
  const staff = await requireArea("settings", "/integrations")
  return <PlatformIntegrations rows={await platformIntegrations()} editable={can(staff.role, "settings")} />
}
