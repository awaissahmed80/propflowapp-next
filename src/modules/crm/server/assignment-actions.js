"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { writeSettings } from "@/modules/portal/server/setup"
import { crmContext } from "./context"
import { CRM_SETTINGS, canEditCrmRules } from "./settings"

// CRM › Customize › Assignment rules: add, change, reorder, switch on/off and delete rules, and the
// "not reached in time" setting. Needs rights to change CRM (Setup).

async function editor() {
  const ctx = await crmContext()
  if (!canEditCrmRules(ctx)) return { error: "Your role can't change assignment rules. Ask an administrator." }
  return { ctx }
}
const list = z.array(z.string().trim().min(1).max(60)).max(100).default([])
const money = z.coerce.number().min(0).nullable().optional()
const schema = z
  .object({
    name: z.string().trim().min(2, "Give the rule a name.").max(120),
    conditions: z.object({ projects: list, sources: list, cities: list, unitTypes: list, overseas: z.boolean().nullable().default(null), budgetMin: money, budgetMax: money }),
    assignTo: z.enum(["agent", "team", "agents"]),
    agentId: z.coerce.number().int().positive().nullable().optional(),
    teamId: z.coerce.number().int().positive().nullable().optional(),
    agentIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
  })
  .superRefine((v, c) => {
    if (v.assignTo === "agent" && !v.agentId) c.addIssue({ path: ["agentId"], code: "custom", message: "Pick the agent." })
    if (v.assignTo === "team" && !v.teamId) c.addIssue({ path: ["teamId"], code: "custom", message: "Pick the team." })
    if (v.assignTo === "agents" && v.agentIds.length < 2) c.addIssue({ path: ["agentIds"], code: "custom", message: "Pick at least two agents to take turns." })
    const { budgetMin: lo, budgetMax: hi } = v.conditions
    if (lo != null && hi != null && lo > hi) c.addIssue({ path: ["budget"], code: "custom", message: "The lowest budget is more than the highest." })
  })

// id: the rule to change, or none to add one at the end
export async function saveAssignmentRule(input, id = null) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0] === "conditions" ? i.path[1] : i.path[0], i.message])) }
  const v = parsed.data
  const row = {
    name: v.name,
    conditions: JSON.stringify(v.conditions),
    assignTo: v.assignTo,
    agentId: v.assignTo === "agent" ? v.agentId : null,
    teamId: v.assignTo === "team" ? v.teamId : null,
    agentIds: JSON.stringify(v.assignTo === "agents" ? v.agentIds : []),
  }
  const now = new Date()
  if (id) {
    const n = await ctx
      .db("leadAssignmentRules")
      .where({ id: Number(id) })
      .whereNull("deletedAt")
      .update({ ...row, updatedAt: now, updatedBy: ctx.user.id })
    if (!n) return { error: "That rule was removed." }
  } else {
    const last = await live(ctx.db, "leadAssignmentRules").max({ n: "sortOrder" }).first()
    await ctx.db("leadAssignmentRules").insert({ ...row, sortOrder: Number(last?.n ?? 0) + 10, isActive: true, createdBy: ctx.user.id })
  }
  await logActivity(ctx.db, {
    type: "settings",
    action: id ? "crm.assignment_rule_updated" : "crm.assignment_rule_added",
    actorUserId: ctx.user.id,
    summary: `${id ? "changed" : "added"} the lead assignment rule “${v.name}”`,
  })
  return { ok: true }
}

export async function setAssignmentRuleActive(id, active) {
  const { ctx, error } = await editor()
  if (error) return { error }
  await ctx
    .db("leadAssignmentRules")
    .where({ id: Number(id) })
    .whereNull("deletedAt")
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// dir: -1 (up) | 1 (down): swaps places with its neighbor
export async function moveAssignmentRule(id, dir) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const rules = await live(ctx.db, "leadAssignmentRules").orderBy("sortOrder").orderBy("id").select("id")
  const i = rules.findIndex((r) => r.id === Number(id))
  const j = i + (dir < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= rules.length) return { ok: true }
  ;[rules[i], rules[j]] = [rules[j], rules[i]]
  await ctx.db.transaction(async (trx) => {
    for (const [n, r] of rules.entries())
      await trx("leadAssignmentRules")
        .where({ id: r.id })
        .update({ sortOrder: (n + 1) * 10 })
  })
  return { ok: true }
}

export async function deleteAssignmentRule(id) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const rule = await live(ctx.db, "leadAssignmentRules")
    .where({ id: Number(id) })
    .first("name")
  if (!rule) return { ok: true }
  await ctx
    .db("leadAssignmentRules")
    .where({ id: Number(id) })
    .update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "settings", action: "crm.assignment_rule_deleted", actorUserId: ctx.user.id, summary: `deleted the lead assignment rule “${rule.name}”` })
  return { ok: true }
}

const reassignSchema = z.object({ reassign: z.boolean(), hours: z.coerce.number().int().min(1, "At least 1 hour.").max(72, "At most 72 hours.") })

export async function saveReassignRule(input) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const parsed = reassignSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: { hours: parsed.error.issues[0]?.message } }
  const v = parsed.data
  await writeSettings(ctx.tenant, { [CRM_SETTINGS.reassign]: v.reassign, [CRM_SETTINGS.reassignHours]: v.hours }, ctx.user.id)
  await logActivity(ctx.db, {
    type: "settings",
    action: "crm.reassign_unreached",
    actorUserId: ctx.user.id,
    summary: v.reassign ? `now reassigns new leads not reached within ${v.hours} ${v.hours === 1 ? "hour" : "hours"}` : "stopped reassigning leads not reached in time",
  })
  return { ok: true }
}
