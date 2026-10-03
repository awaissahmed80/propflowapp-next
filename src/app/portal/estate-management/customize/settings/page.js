import { servicesPage } from "@/modules/estate/server/context"
import { servicesSettings } from "@/modules/estate/server/queries"
import { ServicesSettingsView } from "@/modules/estate/components/services-settings-view"

export const metadata = { title: "Fees & timelines" }

// What each request costs and how long it may take before it's overdue
export default async function ServicesSettingsPage() {
  const ctx = await servicesPage("/estate-management/customize/settings")
  return <ServicesSettingsView settings={await servicesSettings(ctx.db)} canEdit={ctx.can("edit")} />
}
