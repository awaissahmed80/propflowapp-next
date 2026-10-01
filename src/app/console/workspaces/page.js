import { requireArea } from "@/modules/console/server/access"
import { getSetting, listPlans, listWorkspaceInvites, listWorkspaces } from "@/modules/console/server/queries"
import { can } from "@/modules/console/roles"
import { WorkspacesTable } from "@/modules/console/components/workspaces-table"

export const metadata = { title: "Workspaces" }

export default async function WorkspacesPage({ searchParams }) {
  const staff = await requireArea("workspaces", "/workspaces")
  const manage = can(staff.role, "workspaces")
  const [{ status }, rows, { plans, apps }, invites, trialDays, yearlyMonths] = await Promise.all([
    searchParams,
    listWorkspaces(),
    listPlans(),
    listWorkspaceInvites(),
    getSetting("trial_days", 15),
    getSetting("yearly_months_charged", 10),
  ])
  return (
    <WorkspacesTable
      rows={rows}
      plans={plans.map((p) => ({ id: p.id, name: p.name }))}
      initialStatus={typeof status === "string" ? status : null}
      invites={invites}
      invite={
        manage
          ? {
              plans: plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly, apps: p.apps, off: p.off })),
              defaults: { trialDays, yearlyMonths },
              apps: apps.filter((a) => !a.alwaysOn && a.code !== "settings").map((a) => ({ code: a.code, name: a.name, icon: a.icon, color: a.color })),
            }
          : null
      }
    />
  )
}
