import "server-only"
import { live } from "@/server/db/records"
import { assignableAgents } from "@/modules/crm/server/queries"
import { bookingEvent } from "./activity"

// Who handles a booking (bookings.agent_id). Sales › Assignment rules hand it on when it reaches a
// stage, e.g. Active bookings in a project → the collections team, taking turns. Rules are checked
// in order; the first active one for that stage whose conditions match decides. Nothing matches:
// it stays with whoever has it.

const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}
export const shapeSalesRule = (r) => ({
  id: r.id,
  name: r.name,
  active: Boolean(r.isActive),
  stage: r.stage,
  conditions: { projects: [], kinds: [], ...(parse(r.conditions) ?? {}) },
  assignTo: r.assignTo,
  agentId: r.agentId ?? null,
  teamId: r.teamId ?? null,
  agentIds: parse(r.agentIds) ?? [],
  lastAssignedId: r.lastAssignedId ?? null,
})

export async function listSalesRules(db) {
  return (await live(db, "salesAssignmentRules").orderBy("sortOrder").orderBy("id")).map(shapeSalesRule)
}

function candidates(rule, agents) {
  const active = agents.map((a) => a.id)
  if (rule.assignTo === "agent") return active.includes(rule.agentId) ? [rule.agentId] : []
  if (rule.assignTo === "team")
    return agents
      .filter((a) => a.teamId === rule.teamId)
      .map((a) => a.id)
      .sort((x, y) => x - y)
  return rule.agentIds.filter((id) => active.includes(id)).sort((x, y) => x - y)
}
const nextAfter = (ids, last) => ids.find((id) => id > (last ?? 0)) ?? ids[0] ?? null

// A booking just reached `stage`: give it on if a rule says so → the new agent id, or null
//   ctx: salesContext() (or any context with db, tenant, user)
export async function routeBooking(ctx, bookingId, stage) {
  const rules = (await listSalesRules(ctx.db)).filter((r) => r.active && r.stage === stage)
  if (!rules.length) return null
  const b = await ctx.db("bookings as b").join("projects as p", "p.id", "b.projectId").where("b.id", bookingId).first("b.id", "b.kind", "b.agentId", "p.code as projectCode")
  if (!b) return null
  const agents = await assignableAgents(ctx)
  for (const rule of rules) {
    const c = rule.conditions
    if (c.projects.length && !c.projects.includes(b.projectCode)) continue
    if (c.kinds.length && !c.kinds.includes(b.kind)) continue
    const userId = nextAfter(candidates(rule, agents), rule.lastAssignedId)
    if (!userId) continue
    await ctx.db("salesAssignmentRules").where({ id: rule.id }).update({ lastAssignedId: userId })
    if (userId !== b.agentId) {
      const name = agents.find((a) => a.id === userId)?.name ?? "someone"
      await ctx.db("bookings").where({ id: b.id }).update({ agentId: userId, updatedAt: new Date() })
      await bookingEvent(ctx.db, ctx, b.id, "assigned", `Given to ${name} by the rule “${rule.name}”`)
    }
    return userId
  }
  return null
}

// After an action: if the booking's stage moved on from `before`, apply the rules for the new one
export async function afterStageChange(ctx, bookingId, before) {
  const now = await ctx.db("bookings").where({ id: bookingId }).first("stage")
  if (now && now.stage !== before) await routeBooking(ctx, bookingId, now.stage)
}
