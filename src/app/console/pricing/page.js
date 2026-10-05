import { requireArea } from "@/modules/console/server/access"
import { can } from "@/modules/console/roles"
import { getDynamicPricing } from "@/server/dynamic-pricing"
import { DynamicPricingView } from "@/modules/console/components/dynamic-pricing"

export const metadata = { title: "Dynamic Pricing" }

// Console › Dynamic Pricing: base fee, users, a price per app and per extra user, and whether the
// website's create-workspace wizard shows them (instead of the plans)
export default async function DynamicPricingPage() {
  const staff = await requireArea("plans", "/pricing")
  return <DynamicPricingView config={await getDynamicPricing()} editable={can(staff.role, "plans")} />
}
