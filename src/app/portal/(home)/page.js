import { redirect } from "next/navigation"
import { requireTenant } from "@/server/auth/dal"
import { authDb } from "@/server/db/connections"
import { getPortal } from "@/modules/portal/server/context"
import { getSetup } from "@/modules/portal/server/setup"
import { Launcher } from "@/modules/portal/components/launcher"
import { deskContext } from "@/modules/desk/server/context"
import { deskSummary } from "@/modules/desk/server/summary"
import { hrContext } from "@/modules/hr/server/context"
import { isEmployee } from "@/modules/hr/server/self-queries"

export const metadata = { title: "My Desk" }

// Greeting and date in Pakistan time, worked out on the server so every visitor sees the same
function pakistanNow() {
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).format(now))
  return {
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    today: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
  }
}

// The launcher: apps on the left, My Desk in the middle, what's critical on the right
export default async function LauncherPage({ searchParams }) {
  const [{ user, role, tenant, apps, setupCompleted, canSetUp }, { tour }] = await Promise.all([getPortal(), searchParams])
  if (!setupCompleted) redirect("/setup")
  // The side column's checklist of optional setup steps, for those who can do them
  const session = await requireTenant("/")
  const setupSteps = canSetUp ? (await getSetup(session.tenant)).steps : null
  // "Invite your team" for anyone who can open Users & Teams; done once someone else has joined
  const team = apps.some((a) => a.code === "users") ? { done: Number((await authDb()("memberships").where({ tenantId: session.tenant.id }).whereNull("deletedAt").count({ n: "id" }).first()).n) > 1 } : null
  // My Desk: to-dos, approvals waiting, recent activity, and the critical ones
  const ctx = await deskContext("/")
  const desk = await deskSummary(ctx)
  // My leave / My pay / My roster, for people on the payroll here (and the HR features in the plan)
  const hr = (await isEmployee(ctx.db, ctx.user.id)) ? await hrContext("/") : null
  const selfService = hr ? { leave: hr.has("leave"), pay: hr.has("payroll"), roster: hr.has("attendance") } : null
  const { greeting, today } = pakistanNow()
  // Keyed on the tour flag so "Take the tour" restarts it even when the launcher is already open
  return (
    <Launcher
      key={tour === "1" ? "tour" : "home"}
      user={{ id: user.id, name: user.name }}
      role={role}
      tenant={tenant}
      apps={apps}
      desk={desk}
      selfService={selfService}
      greeting={greeting}
      today={today}
      setupSteps={setupSteps}
      team={team}
      startTour={tour === "1"}
    />
  )
}
