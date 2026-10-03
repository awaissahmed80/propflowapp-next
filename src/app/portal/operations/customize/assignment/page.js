import { notFound } from "next/navigation"
import { live } from "@/server/db/records"
import { salesPage } from "@/modules/operations/server/context"
import { canEditSalesRules } from "@/modules/operations/server/settings"
import { listSalesRules } from "@/modules/operations/server/assignment"
import { assignableAgents, crmProjects } from "@/modules/crm/server/queries"
import { SalesRulesView } from "@/modules/operations/components/sales-rules-view"

export const metadata = { title: "Assignment rules" }

// Who handles bookings from each stage on (setup rights, or approve in Sales)
export default async function SalesAssignmentPage() {
  const ctx = await salesPage("/operations/customize/assignment")
  if (!canEditSalesRules(ctx)) notFound()
  const [rules, agents, teams, projects] = await Promise.all([listSalesRules(ctx.db), assignableAgents(ctx), live(ctx.db, "teams").orderBy("name").select("id", "name"), crmProjects(ctx)])
  const withCounts = teams.map((t) => ({ ...t, agents: agents.filter((a) => a.teamId === t.id).length }))
  return <SalesRulesView rules={rules} agents={agents} teams={withCounts} projects={projects} me={ctx.user.id} />
}
