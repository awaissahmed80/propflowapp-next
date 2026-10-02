import "server-only"
import { live } from "@/server/db/records"
import { logActivity as logToWorkspace } from "@/server/tenants/activity"
import { assignableAgents } from "./queries"
import { CRM_SETTINGS, crmSettings } from "./settings"

// Who gets a new lead (CRM › Assignment rules). Rules are checked in order; the first active
// rule whose conditions all match decides: one agent, round-robin within a team, or round-robin
// among chosen agents. Only active agents (not dealer logins) can be picked; a rule with nobody
// left to pick is skipped. No rule matches → null (the caller falls back to auto-assign).

// JSON columns usually arrive parsed; parse text only when it is JSON
const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}
export const shapeRule = (r) => ({
  id: r.id,
  name: r.name,
  active: Boolean(r.isActive),
  conditions: { projects: [], sources: [], cities: [], overseas: null, unitTypes: [], budgetMin: null, budgetMax: null, ...(parse(r.conditions) ?? {}) },
  assignTo: r.assignTo,
  agentId: r.agentId ?? null,
  teamId: r.teamId ?? null,
  agentIds: parse(r.agentIds) ?? [],
  lastAssignedId: r.lastAssignedId ?? null,
})

export async function listRules(db) {
  return (await live(db, "leadAssignmentRules").orderBy("sortOrder").orderBy("id")).map(shapeRule)
}

// Does a lead (row as saved: projectId, source, city, overseas, unitType, budgetMin/Max) match?
//   projectCodes: Map projectId → code
export function matches(rule, lead, projectCodes) {
  const c = rule.conditions
  const lower = (v) => String(v ?? "").toLowerCase()
  if (c.projects.length && !c.projects.map(lower).includes(lower(projectCodes.get(lead.projectId)))) return false
  if (c.sources.length && !c.sources.includes(lead.source)) return false
  if (c.cities.length && !c.cities.map(lower).includes(lower(lead.city))) return false
  if (c.overseas === true && !lead.overseas) return false
  if (c.overseas === false && lead.overseas) return false
  if (c.unitTypes.length && !c.unitTypes.includes(lead.unitType)) return false
  // Budget: the lead's range has to overlap the rule's (a lead with no budget doesn't match a budget rule)
  if (c.budgetMin != null || c.budgetMax != null) {
    const lo = Number(lead.budgetMin ?? lead.budgetMax ?? NaN)
    const hi = Number(lead.budgetMax ?? lead.budgetMin ?? NaN)
    if (Number.isNaN(lo)) return false
    if (c.budgetMin != null && hi < Number(c.budgetMin)) return false
    if (c.budgetMax != null && lo > Number(c.budgetMax)) return false
  }
  return true
}

// The people a rule hands leads to, in a fixed order, active only
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

// Next in a rotation after `last`, skipping `exclude`
const nextAfter = (ids, last, exclude) => {
  const pool = ids.filter((id) => id !== exclude)
  return pool.find((id) => id > (last ?? 0)) ?? pool[0] ?? null
}

// → { userId, rule } and moves that rule's rotation on; or null when no rule applies
//   exclude: someone not to give it to (the reassign check skips the current agent)
export async function pickByRules(ctx, lead, { exclude = null } = {}) {
  const rules = (await listRules(ctx.db)).filter((r) => r.active)
  if (!rules.length) return null
  const [agents, projects] = await Promise.all([assignableAgents(ctx), live(ctx.db, "projects").select("id", "code")])
  const codes = new Map(projects.map((p) => [p.id, p.code]))
  for (const rule of rules) {
    if (!matches(rule, lead, codes)) continue
    const userId = nextAfter(candidates(rule, agents), rule.lastAssignedId, exclude)
    if (!userId) continue
    await ctx.db("leadAssignmentRules").where({ id: rule.id }).update({ lastAssignedId: userId })
    return { userId, rule: rule.name }
  }
  return null
}

// The workspace-wide round-robin (Settings › CRM › Auto-assign): the active rep after whoever
// got the last auto-assigned lead
export async function nextInTurn(ctx, { exclude = null } = {}) {
  const prefs = await crmSettings(ctx.db)
  const reps = (await assignableAgents(ctx)).map((a) => a.id).sort((x, y) => x - y)
  const next = nextAfter(reps, prefs.lastAssigned, exclude)
  if (!next) return null
  await ctx
    .db("settings")
    .insert({ key: CRM_SETTINGS.lastAssigned, value: JSON.stringify(next), updatedAt: new Date(), updatedBy: ctx.user.id })
    .onConflict("key")
    .merge(["value", "updatedAt", "updatedBy"])
  return next
}

const SWEEP_EVERY = 10 * 60_000

// New leads nobody has reached within the set hours go to the next agent (by the rules, or the
// round-robin), once per lead. There's no scheduler: this runs as CRM pages open, at most every
// ten minutes per workspace. Their planned follow-ups move with them.
export async function reassignUnreached(ctx) {
  const prefs = await crmSettings(ctx.db)
  if (!prefs.reassign) return
  const now = new Date()
  if (prefs.reassignSweptAt && now - new Date(prefs.reassignSweptAt) < SWEEP_EVERY) return
  await ctx
    .db("settings")
    .insert({ key: CRM_SETTINGS.reassignSweptAt, value: JSON.stringify(now.toISOString()), updatedAt: now })
    .onConflict("key")
    .merge(["value", "updatedAt"])
  const due = await live(ctx.db, "leads")
    .where({ status: "new" })
    .whereNull("firstContactAt")
    .whereNull("archivedAt")
    .whereNull("autoReassignedAt")
    .whereNotNull("assignedTo")
    .where("createdAt", "<", new Date(now.getTime() - prefs.reassignHours * 3_600_000))
    .limit(200)
  if (!due.length) return
  const [agents, teams] = await Promise.all([assignableAgents(ctx), live(ctx.db, "members").select("userId", "teamId")])
  const teamOf = new Map(teams.map((m) => [m.userId, m.teamId]))
  const nameOf = new Map(agents.map((a) => [a.id, a.name]))
  let moved = 0
  for (const lead of due) {
    const picked = (await pickByRules(ctx, lead, { exclude: lead.assignedTo }))?.userId ?? (prefs.autoAssign ? await nextInTurn(ctx, { exclude: lead.assignedTo }) : null)
    // Nobody else to give it to: leave it, and don't try again
    await ctx.db.transaction(async (trx) => {
      const at = new Date()
      if (!picked) return trx("leads").where({ id: lead.id }).update({ autoReassignedAt: at })
      await trx("leads")
        .where({ id: lead.id })
        .update({ assignedTo: picked, teamId: teamOf.get(picked) ?? null, autoReassignedAt: at, updatedAt: at })
      await trx("leadActivities").where({ leadId: lead.id, status: "planned" }).whereNull("deletedAt").update({ by: picked, updatedAt: at })
      await trx("leadActivities").insert({
        leadId: lead.id,
        type: "system",
        status: "done",
        at,
        doneAt: at,
        by: null,
        notes: `Given to ${nameOf.get(picked) ?? "someone"}: not reached within ${prefs.reassignHours} ${prefs.reassignHours === 1 ? "hour" : "hours"}`,
      })
      moved++
    })
  }
  if (moved) await logToWorkspace(ctx.db, { type: "crm", action: "lead.auto_reassigned", actorUserId: null, summary: `reassigned ${moved} ${moved === 1 ? "lead" : "leads"} nobody had reached in time` })
}
