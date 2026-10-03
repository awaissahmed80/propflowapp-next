"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { writeSettings } from "@/modules/portal/server/setup"
import { assignableAgents } from "@/modules/crm/server/queries"
import { bookingEvent } from "./activity"
import { salesContext, scoped } from "./context"
import { SALES_SETTINGS, canEditSalesRules } from "./settings"

// Sales › Setup: assignment rules and settings (setup rights, or approve in Sales), and handing a
// booking to someone else (the sales.reassign grant).

async function editor() {
  const ctx = await salesContext()
  if (!canEditSalesRules(ctx)) return { error: "Your role can't change Operations setup. Ask an administrator." }
  return { ctx }
}
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "settings", action, actorUserId: ctx.user.id, summary })
const list = z.array(z.string().trim().min(1).max(60)).max(100).default([])

const ruleSchema = z
  .object({
    name: z.string().trim().min(2, "Give the rule a name.").max(120),
    stage: z.enum(["token", "booking-kyc", "active", "handover", "completed"]),
    conditions: z.object({ projects: list, kinds: z.array(z.enum(["token", "booking"])).default([]) }),
    assignTo: z.enum(["agent", "team", "agents"]),
    agentId: z.coerce.number().int().positive().nullable().optional(),
    teamId: z.coerce.number().int().positive().nullable().optional(),
    agentIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
  })
  .superRefine((v, c) => {
    if (v.assignTo === "agent" && !v.agentId) c.addIssue({ path: ["agentId"], code: "custom", message: "Pick the person." })
    if (v.assignTo === "team" && !v.teamId) c.addIssue({ path: ["teamId"], code: "custom", message: "Pick the team." })
    if (v.assignTo === "agents" && v.agentIds.length < 2) c.addIssue({ path: ["agentIds"], code: "custom", message: "Pick at least two people to take turns." })
  })

export async function saveSalesRule(input, id = null) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const parsed = ruleSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const row = {
    name: v.name,
    stage: v.stage,
    conditions: JSON.stringify(v.conditions),
    assignTo: v.assignTo,
    agentId: v.assignTo === "agent" ? v.agentId : null,
    teamId: v.assignTo === "team" ? v.teamId : null,
    agentIds: JSON.stringify(v.assignTo === "agents" ? v.agentIds : []),
  }
  if (id) {
    const n = await ctx
      .db("salesAssignmentRules")
      .where({ id: Number(id) })
      .whereNull("deletedAt")
      .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
    if (!n) return { error: "That rule was removed." }
  } else {
    const last = await live(ctx.db, "salesAssignmentRules").max({ n: "sortOrder" }).first()
    await ctx.db("salesAssignmentRules").insert({ ...row, sortOrder: Number(last?.n ?? 0) + 10, isActive: true, createdBy: ctx.user.id })
  }
  await log(ctx, id ? "operations.assignment_rule_updated" : "operations.assignment_rule_added", `${id ? "changed" : "added"} the booking assignment rule “${v.name}”`)
  return { ok: true }
}

export async function setSalesRuleActive(id, active) {
  const { ctx, error } = await editor()
  if (error) return { error }
  await ctx
    .db("salesAssignmentRules")
    .where({ id: Number(id) })
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

export async function moveSalesRule(id, dir) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const rules = await live(ctx.db, "salesAssignmentRules").orderBy("sortOrder").orderBy("id").select("id")
  const i = rules.findIndex((r) => r.id === Number(id))
  const j = i + (dir < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= rules.length) return { ok: true }
  ;[rules[i], rules[j]] = [rules[j], rules[i]]
  await ctx.db.transaction(async (trx) => {
    for (const [n, r] of rules.entries())
      await trx("salesAssignmentRules")
        .where({ id: r.id })
        .update({ sortOrder: (n + 1) * 10 })
  })
  return { ok: true }
}

export async function deleteSalesRule(id) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const rule = await live(ctx.db, "salesAssignmentRules")
    .where({ id: Number(id) })
    .first("name")
  if (!rule) return { ok: true }
  await ctx
    .db("salesAssignmentRules")
    .where({ id: Number(id) })
    .update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await log(ctx, "operations.assignment_rule_deleted", `deleted the booking assignment rule “${rule.name}”`)
  return { ok: true }
}

const settingsSchema = z.object({
  enforceDocuments: z.boolean(),
  approveRefunds: z.boolean(),
  approveDiscounts: z.boolean(),
  defaulterLines: z.coerce.number().int().min(1, "At least 1.").max(24, "At most 24."),
  defaulterDays: z.coerce.number().int().min(7, "At least 7 days.").max(365, "At most 365 days."),
  deductionPct: z.coerce.number().int().min(0).max(100, "At most 100%."),
  dealerCommissionPct: z.coerce.number().min(0).max(20, "At most 20%."),
  agentCommissionPct: z.coerce.number().min(0).max(20, "At most 20%."),
  commissionTrigger: z.enum(["token", "down-payment", "allotment"]),
  dealerWhtPct: z.coerce.number().min(0).max(50, "At most 50%."),
})

export async function saveSalesSettings(input) {
  const { ctx, error } = await editor()
  if (error) return { error }
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  await writeSettings(ctx.tenant, Object.fromEntries(Object.entries(SALES_SETTINGS).map(([k, key]) => [key, v[k]])), ctx.user.id)
  await log(ctx, "operations.settings", "changed the Operations settings")
  return { ok: true }
}

// Give a booking to someone else (sales.reassign) → { ok } | { error }
export async function reassignBooking(code, userId) {
  const ctx = await salesContext()
  if (!ctx.can("edit") || !ctx.grant("operations.reassign")) return { error: "Your role can't give bookings to other people." }
  const b = await scoped(ctx, live(ctx.db, "bookings"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "agentId")
  if (!b) return { error: "That booking was removed or isn't yours to see." }
  const to = (await assignableAgents(ctx)).find((a) => a.id === Number(userId))
  if (!to) return { error: "They can't take bookings." }
  if (to.id === b.agentId) return { ok: true }
  await ctx.db.transaction(async (trx) => {
    await trx("bookings").where({ id: b.id }).update({ agentId: to.id, updatedAt: new Date(), updatedBy: ctx.user.id })
    await bookingEvent(trx, ctx, b.id, "assigned", `Given to ${to.name}`)
  })
  await logActivity(ctx.db, { type: "operations", action: "booking.reassigned", actorUserId: ctx.user.id, summary: `gave ${b.code} to ${to.name}` })
  return { ok: true }
}
