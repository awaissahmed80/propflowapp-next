import { requireArea } from "@/modules/console/server/access"
import { getSetting, listPlans, listWorkspaceInvites, listWorkspaces } from "@/modules/console/server/queries"
import { can } from "@/modules/console/roles"
import { WorkspacesTable } from "@/modules/console/components/workspaces-table"
import { demoWorkspaceStatus } from "@/server/tenants/demo-workspace"
import { siteUrl } from "@/lib/sites"

export const metadata = { title: "Workspaces" }

export default async function WorkspacesPage({ searchParams }) {
  const staff = await requireArea("workspaces", "/workspaces")
  const manage = can(staff.role, "workspaces")
  const [{ status }, rows, { plans, apps }, invites, trialDays, yearlyMonths, demoStatus] = await Promise.all([
    searchParams,
    listWorkspaces(),
    listPlans(),
    listWorkspaceInvites(),
    getSetting("trial_days", 15),
    getSetting("yearly_months_charged", 10),
    demoWorkspaceStatus(),
  ])
  // The demo workspace card: everyone who sees Workspaces sees its sign-ins; owners and admins manage it
  const { state, tenant, people, company } = demoStatus
  const ready = state?.status === "ready" && tenant
  const demo = {
    status: ["installing", "removing", "failed", "external"].includes(state?.status) ? state.status : ready ? "ready" : "none",
    step: state?.step ?? null,
    percent: state?.percent ?? 0,
    error: state?.error ?? null,
    code: tenant?.code ?? state?.code ?? null,
    password: ready ? state.password : null,
    installedAt: state?.installedAt ?? null,
    seconds: state?.seconds ?? null,
    people,
    company,
    signInUrl: siteUrl("auth", "/"),
  }
  return (
    <WorkspacesTable
      rows={rows}
      plans={plans.map((p) => ({ id: p.id, name: p.name }))}
      initialStatus={typeof status === "string" ? status : null}
      invites={invites}
      demo={demo}
      demoAccess={{ manage, send: manage || can(staff.role, "enquiries") }}
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
