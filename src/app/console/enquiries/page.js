import { requireArea } from "@/modules/console/server/access"
import { getSetting, listEnquiries, listPlans } from "@/modules/console/server/queries"
import { can } from "@/modules/console/roles"
import { EnquiriesView } from "@/modules/console/components/enquiries-view"

export const metadata = { title: "Sales Enquiries" }

export default async function EnquiriesPage() {
  const staff = await requireArea("enquiries", "/enquiries")
  // Staff who may invite workspaces can turn a get-started lead into one, with its package
  const invite = can(staff.role, "workspaces")
    ? await Promise.all([listPlans(), getSetting("trial_days", 15), getSetting("yearly_months_charged", 10)]).then(([{ plans, apps }, trialDays, yearlyMonths]) => ({
        plans: plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly, apps: p.apps, off: p.off })),
        defaults: { trialDays, yearlyMonths },
        apps: apps.filter((a) => !a.alwaysOn && a.code !== "settings").map((a) => ({ code: a.code, name: a.name, icon: a.icon, color: a.color })),
      }))
    : null
  return <EnquiriesView list={await listEnquiries()} invite={invite} />
}
