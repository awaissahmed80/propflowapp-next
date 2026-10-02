import { notFound } from "next/navigation"
import { live } from "@/server/db/records"
import { crmPage } from "@/modules/crm/server/context"
import { assignableAgents, crmProjects } from "@/modules/crm/server/queries"
import { listRules } from "@/modules/crm/server/assignment"
import { canEditCrmRules, crmSettings } from "@/modules/crm/server/settings"
import { AssignmentView } from "@/modules/crm/components/assignment-view"

export const metadata = { title: "Assignment rules" }

// Who gets new leads (Setup: locked in the sidebar for people who can't change CRM)
export default async function CrmAssignmentPage() {
  const ctx = await crmPage("/crm/assignment", "assignment")
  if (!canEditCrmRules(ctx)) notFound()
  const [rules, agents, teams, projects, settings] = await Promise.all([listRules(ctx.db), assignableAgents(ctx), live(ctx.db, "teams").orderBy("name").select("id", "name"), crmProjects(ctx), crmSettings(ctx.db)])
  const withCounts = teams.map((t) => ({ ...t, agents: agents.filter((a) => a.teamId === t.id).length }))
  return (
    <AssignmentView
      rules={rules}
      agents={agents}
      teams={withCounts}
      projects={projects}
      settings={{ autoAssign: settings.autoAssign, reassign: settings.reassign, reassignHours: settings.reassignHours }}
      me={ctx.user.id}
    />
  )
}
