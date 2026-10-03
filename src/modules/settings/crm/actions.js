"use server"

import { z } from "zod"
import { logActivity } from "@/server/tenants/activity"
import { writeSettings } from "@/modules/portal/server/setup"
import { crmContext } from "@/modules/crm/server/context"
import { CRM_SETTINGS, canEditCrmRules } from "@/modules/crm/server/settings"

// Used from Settings › CRM and CRM › Customize
async function rulesEditor() {
  const ctx = await crmContext()
  if (!canEditCrmRules(ctx)) return { error: "Your role can't change CRM settings. Ask an administrator." }
  return { ctx }
}

// The workspace's pipeline rules
const schema = z.object({
  autoAssign: z.boolean(),
  statusNote: z.boolean(),
  stale: z.boolean(),
  staleDays: z.coerce.number().int().min(1, "At least 1 day.").max(365, "At most 365 days."),
})

const SUMMARY = {
  autoAssign: (on) => (on ? "turned on auto-assigning new leads" : "turned off auto-assigning new leads"),
  statusNote: (on) => (on ? "now requires a note before a stage change" : "no longer requires a note before a stage change"),
  stale: (on, v) => (on ? `flags leads with no activity for ${v.staleDays} days` : "stopped flagging stale leads"),
  staleDays: (_, v) => `flags leads with no activity for ${v.staleDays} days`,
}

// changed: which rule was just changed (for the activity log)
export async function savePipelineRules(input, changed) {
  const { ctx, error } = await rulesEditor()
  if (error) return { error }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  await writeSettings(ctx.tenant, { [CRM_SETTINGS.autoAssign]: v.autoAssign, [CRM_SETTINGS.statusNote]: v.statusNote, [CRM_SETTINGS.stale]: v.stale, [CRM_SETTINGS.staleDays]: v.staleDays }, ctx.session.user.id)
  if (SUMMARY[changed]) await logActivity(ctx.db, { type: "settings", action: "crm.pipeline_rules", actorUserId: ctx.session.user.id, summary: SUMMARY[changed](v[changed], v) })
  return { ok: true }
}

// Settings › CRM › Lead scoring: on/off, how the three parts are weighed, and what counts as engaged
const scoringSchema = z
  .object({
    scoring: z.boolean(),
    engagement: z.coerce.number().int().min(0).max(100),
    affordability: z.coerce.number().int().min(0).max(100),
    intent: z.coerce.number().int().min(0).max(100),
    engagementDays: z.coerce.number().int().min(7, "At least 7 days.").max(365, "At most 365 days."),
    engagementTarget: z.coerce.number().int().min(1, "At least 1 point.").max(500, "At most 500 points."),
  })
  .refine((v) => v.engagement + v.affordability + v.intent === 100, { path: ["weights"], message: "The three parts have to add up to 100%." })

export async function saveLeadScoring(input) {
  const { ctx, error } = await rulesEditor()
  if (error) return { error }
  const parsed = scoringSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  await writeSettings(
    ctx.tenant,
    {
      [CRM_SETTINGS.scoring]: v.scoring,
      [CRM_SETTINGS.scoreWeights]: { engagement: v.engagement, affordability: v.affordability, intent: v.intent },
      [CRM_SETTINGS.engagementDays]: v.engagementDays,
      [CRM_SETTINGS.engagementTarget]: v.engagementTarget,
    },
    ctx.session.user.id,
  )
  await logActivity(ctx.db, {
    type: "settings",
    action: "crm.lead_scoring",
    actorUserId: ctx.session.user.id,
    summary: v.scoring ? `set lead scoring to engagement ${v.engagement}%, affordability ${v.affordability}%, intent ${v.intent}%` : "turned off lead scoring",
  })
  return { ok: true }
}
