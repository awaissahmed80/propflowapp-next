import { crmPage } from "@/modules/crm/server/context"
import { assignableAgents, crmProjects, listLeads } from "@/modules/crm/server/queries"
import { LeadsView } from "@/modules/crm/components/leads-view"

export const metadata = { title: "Leads" }

// Leads list and board. ?lead=ld-00001 opens a lead; ?new=1 opens the new-lead form.
export default async function LeadsPage() {
  const ctx = await crmPage("/crm/leads")
  const [leads, agents, projects] = await Promise.all([listLeads(ctx), assignableAgents(ctx), crmProjects(ctx)])
  return <LeadsView leads={leads} agents={agents} projects={projects} me={ctx.user.id} access={{ create: ctx.can("create"), edit: ctx.can("edit"), reassign: ctx.canReassign, scope: ctx.scope }} />
}
