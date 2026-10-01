import { requireArea } from "@/modules/console/server/access"
import { getSetting, listPlans } from "@/modules/console/server/queries"
import { can } from "@/modules/console/roles"
import { PlansView } from "@/modules/console/components/plans-view"

export const metadata = { title: "Plans & Pricing" }

export default async function PlansPage() {
  const staff = await requireArea("plans", "/plans")
  const [{ plans, apps }, trialDays] = await Promise.all([listPlans(), getSetting("trial_days", 15)])
  return <PlansView plans={plans} apps={apps} trialDays={trialDays} editable={can(staff.role, "plans")} />
}
