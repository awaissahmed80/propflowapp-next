"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { GOAL_METRICS } from "../constants"
import { campaignsAction } from "./context"

// Campaigns: add / change a campaign, and move it through its life (draft → scheduled / live →
// paused → ended)

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const date = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
)
const amount = z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0).max(1e11))

const schema = z
  .object({
    name: z.string().trim().min(2, "Give the campaign a name.").max(150),
    objective: z.string().trim().max(40).optional().nullable(),
    project: z.string().trim().max(30).optional().nullable(),
    startDate: date,
    endDate: date,
    ownerId: z.coerce.number().int().positive().optional().nullable(),
    audience: z.string().trim().max(500).optional().default(""),
    offer: z.string().trim().max(500).optional().default(""),
    notes: z.string().trim().max(4000).optional().default(""),
    channels: z
      .array(z.object({ channel: z.string().trim().min(1, "Pick the channel."), budget: amount, spend: amount, impressions: amount, clicks: amount }))
      .min(1, "Add at least one channel.")
      .max(20),
    goals: z
      .array(z.object({ metric: z.enum(GOAL_METRICS.map((g) => g.value)), target: z.preprocess((v) => (v === "" ? null : Number(v)), z.number().positive("Set a target.")) }))
      .max(8)
      .default([]),
  })
  .superRefine((v, c) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) c.addIssue({ path: ["endDate"], code: "custom", message: "Ends before it starts." })
    const seen = new Set()
    v.channels.forEach((ch, i) => {
      if (seen.has(ch.channel)) c.addIssue({ path: ["channels", i, "channel"], code: "custom", message: "This channel is already listed." })
      seen.add(ch.channel)
    })
  })

// New (no code) or changed campaign → { ok, code } | { error } | { fieldErrors }
export async function saveCampaign(input, code = null) {
  const { ctx, error } = await campaignsAction(code ? "edit" : "create")
  if (error) return { error }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const lists = await getLookups(ctx.db, ["campaign-objective", "lead-source"])
  if (v.objective && !isLookupValue(lists["campaign-objective"], v.objective)) return { fieldErrors: { objective: "Pick an objective." } }
  const bad = v.channels.findIndex((ch) => !lists["lead-source"].some((x) => x.value === ch.channel))
  if (bad >= 0) return { fieldErrors: { [`channels.${bad}.channel`]: "Pick a channel." } }
  const project = v.project ? await live(ctx.db, "projects").where({ code: v.project.toUpperCase() }).first("id") : null
  if (v.project && !project) return { fieldErrors: { project: "That project was removed." } }
  const current = code
    ? await live(ctx.db, "campaigns")
        .where({ code: String(code).toUpperCase() })
        .first("id", "status")
    : null
  if (code && !current) return { error: "That campaign was removed." }
  const clash = await live(ctx.db, "campaigns")
    .where({ name: v.name })
    .whereNot({ id: current?.id ?? 0 })
    .first("id")
  if (clash) return { fieldErrors: { name: "Another campaign already has this name." } }

  const row = {
    name: v.name,
    objective: v.objective || null,
    projectId: project?.id ?? null,
    startDate: v.startDate ?? null,
    endDate: v.endDate ?? null,
    ownerId: v.ownerId ?? ctx.user.id,
    audience: v.audience || null,
    offer: v.offer || null,
    notes: v.notes || null,
    channels: JSON.stringify(v.channels),
    goals: JSON.stringify(v.goals),
  }
  let saved = code ? String(code).toUpperCase() : null
  await ctx.db.transaction(async (trx) => {
    if (current)
      await trx("campaigns")
        .where({ id: current.id })
        .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
    else {
      saved = await nextCode(trx, "campaign")
      await trx("campaigns").insert({ ...row, code: saved, status: "draft", createdBy: ctx.user.id })
    }
  })
  await logActivity(ctx.db, { type: "campaigns", action: current ? "campaign.updated" : "campaign.created", actorUserId: ctx.user.id, summary: `${current ? "changed" : "added"} the campaign ${v.name} (${saved})` })
  return { ok: true, code: saved }
}

const MOVES = {
  launch: { from: ["draft"], to: (c, today) => (c.startDate && c.startDate > today ? "scheduled" : "active") },
  draft: { from: ["scheduled"], to: () => "draft" },
  pause: { from: ["active", "scheduled"], to: () => "paused" },
  resume: { from: ["paused"], to: () => "active" },
  end: { from: ["active", "paused", "scheduled"], to: () => "completed" },
}

// Launch / back to draft / pause / resume / end → { ok, status } | { error }
export async function moveCampaign(code, move) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const m = MOVES[move]
  if (!m) return { error: "Unknown change." }
  const c = await live(ctx.db, "campaigns")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "name", "status", "startDate")
  if (!c) return { error: "That campaign was removed." }
  if (!m.from.includes(c.status)) return { error: "It can't do that from where it is now." }
  const startDate = c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : null
  if (move === "launch" && !startDate) return { error: "Set a start date before launching." }
  const status = m.to({ startDate }, new Date().toISOString().slice(0, 10))
  await ctx.db("campaigns").where({ id: c.id }).update({ status, updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "campaigns", action: `campaign.${move}`, actorUserId: ctx.user.id, summary: `${move === "end" ? "ended" : move === "launch" ? "launched" : `${move}d`} the campaign ${c.name}` })
  return { ok: true, status }
}
