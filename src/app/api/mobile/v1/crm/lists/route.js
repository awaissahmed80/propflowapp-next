import { appClosed, json, mobileRoute } from "@/modules/mobile/server/api"
import { crmContext } from "@/modules/crm/server/context"
import { assignableAgents, crmLists, crmProjects } from "@/modules/crm/server/queries"

// GET /api/mobile/v1/crm/lists: the pick-lists CRM screens need (statuses, sources, temperatures,
// activity types and outcomes, follow-up options, loss reasons…), the projects and who leads can
// be given to → { lists, projects, agents, can: { create, edit, reassign } }. docs/mobile-api.md
export const GET = mobileRoute(async () => {
  const ctx = await crmContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const [lists, projects, agents] = await Promise.all([crmLists(ctx), crmProjects(ctx), assignableAgents(ctx)])
  return json({ lists, projects, agents, can: { create: ctx.can("create"), edit: ctx.can("edit"), reassign: ctx.canReassign } })
})
