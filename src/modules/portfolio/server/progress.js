"use server"

import crypto from "node:crypto"
import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { IMAGE_TYPES, attachAssets, storeAsset } from "@/server/assets"
import { can, isFullAccess } from "@/modules/users/permissions"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { estateAction } from "./context"

// Project progress (% per development work), updates (timeline posts with photos) and events.

const newCode = () => crypto.randomBytes(16).toString("hex").slice(0, 20)
const findProject = (ctx, code) =>
  live(ctx.db, "projects")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "name")
const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message]))

// A phase of this project (by id, from the page), or null for the whole project
async function phaseOf(ctx, project, phaseId) {
  if (!phaseId) return null
  return (
    (await live(ctx.db, "projectPhases")
      .where({ id: Number(phaseId), projectId: project.id })
      .first("id", "name")) ?? false
  )
}

// ---------- progress ----------

const progressSchema = z.object({
  phaseId: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  // work → percent (null: not tracked)
  items: z.record(
    z.string(),
    z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).max(100).nullable()),
  ),
  note: z.string().trim().max(2000).optional().default(""),
  postUpdate: z.boolean().default(true),
})

// Save % complete per work; changes can be posted to the updates timeline
export async function saveProgress(projectCode, input) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const project = await findProject(ctx, projectCode)
  if (!project) return { error: "That project was removed." }
  const parsed = progressSchema.safeParse(input)
  if (!parsed.success) return { error: "Percentages are whole numbers from 0 to 100." }
  const { phaseId, items, note, postUpdate } = parsed.data
  const phase = await phaseOf(ctx, project, phaseId)
  if (phase === false) return { error: "That phase was removed." }
  const works = (await getLookups(ctx.db, ["development-work"]))["development-work"]

  const current = await live(ctx.db, "projectProgress")
    .where({ projectId: project.id, phaseId: phase?.id ?? null })
    .select("id", "work", "percent")
  const changes = []
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    for (const [work, percent] of Object.entries(items)) {
      const row = current.find((r) => r.work === work)
      if (percent == null) {
        if (row) {
          await trx("projectProgress").where({ id: row.id }).update({ deletedAt: now, deletedBy: ctx.user.id })
          changes.push({ work, from: row.percent, to: null })
        }
        continue
      }
      if (!row && !isLookupValue(works, work)) continue
      if (row) {
        if (row.percent !== percent) {
          await trx("projectProgress").where({ id: row.id }).update({ percent, updatedAt: now, updatedBy: ctx.user.id })
          changes.push({ work, from: row.percent, to: percent })
        }
      } else {
        await trx("projectProgress").insert({ projectId: project.id, phaseId: phase?.id ?? null, work, percent, createdBy: ctx.user.id })
        changes.push({ work, from: null, to: percent })
      }
    }
    if (postUpdate && (changes.length || note)) {
      const label = (w) => works.find((x) => x.value === w)?.label ?? w
      const title = changes.length
        ? `${phase ? `${phase.name}: ` : ""}${changes
            .filter((c) => c.to != null)
            .slice(0, 3)
            .map((c) => `${label(c.work)} ${c.to}%`)
            .join(", ")}${changes.length > 3 ? "…" : ""}`
        : `${phase ? `${phase.name} ` : ""}progress update`
      await trx("projectUpdates").insert({
        code: newCode(),
        projectId: project.id,
        phaseId: phase?.id ?? null,
        type: "construction",
        title: title || "Progress update",
        body: note || null,
        changes: JSON.stringify(changes),
        postedAt: now,
        createdBy: ctx.user.id,
      })
    }
  })
  if (changes.length)
    await logActivity(ctx.db, { type: "portfolio", action: "project.progress", actorUserId: ctx.user.id, summary: `updated development progress of ${project.name}`, subjectType: "project", subjectId: project.id })
  return { ok: true, changed: changes.length }
}

// ---------- updates ----------

const updateSchema = z.object({
  type: z.string().min(1),
  title: z.string().trim().min(3, "Give the update a title.").max(200),
  body: z.string().trim().max(10000).optional().default(""),
  phaseId: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  postedAt: z.preprocess((v) => (v ? new Date(v) : new Date()), z.date()),
})

// New (no code) or edited update → { ok, code } or { error, fieldErrors }
export async function saveUpdate(projectCode, input, code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const project = await findProject(ctx, projectCode)
  if (!project) return { error: "That project was removed." }
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const v = parsed.data
  const types = (await getLookups(ctx.db, ["update-type"]))["update-type"]
  const existing = code ? await live(ctx.db, "projectUpdates").where({ code, projectId: project.id }).first("id", "type") : null
  if (code && !existing) return { error: "That update was removed." }
  if (v.type !== existing?.type && !isLookupValue(types, v.type)) return { fieldErrors: { type: "Pick a type from the list." } }
  const phase = await phaseOf(ctx, project, v.phaseId)
  if (phase === false) return { fieldErrors: { phaseId: "That phase was removed." } }
  const row = { type: v.type, title: v.title, body: v.body || null, phaseId: phase?.id ?? null, postedAt: v.postedAt > new Date() ? new Date() : v.postedAt }
  let saved = code
  if (existing)
    await ctx
      .db("projectUpdates")
      .where({ id: existing.id })
      .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
  else {
    saved = newCode()
    await ctx.db("projectUpdates").insert({ ...row, code: saved, projectId: project.id, createdBy: ctx.user.id })
    await logActivity(ctx.db, { type: "portfolio", action: "project.update_posted", actorUserId: ctx.user.id, summary: `posted "${v.title}" on ${project.name}`, subjectType: "project", subjectId: project.id })
  }
  return { ok: true, code: saved }
}

const findUpdate = (ctx, code) =>
  live(ctx.db, "projectUpdates")
    .where({ code: String(code ?? "") })
    .first("id", "projectId", "title")

export async function deleteUpdate(code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const u = await findUpdate(ctx, code)
  if (!u) return { error: "That update was already removed." }
  await ctx.db("projectUpdates").where({ id: u.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  return { ok: true }
}

// Photos on an update (assets of the update)
export async function uploadUpdatePhoto(code, formData) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const u = await findUpdate(ctx, code)
  if (!u) return { error: "That update was removed." }
  const result = await storeAsset(ctx.db, ctx.tenant, { app: "portfolio", ownerType: "project_update", ownerId: u.id, collection: "images", file: formData?.get?.("file"), allowed: IMAGE_TYPES, userId: ctx.user.id })
  return result.error ? { error: result.error } : { ok: true }
}

export async function attachUpdatePhotos(code, codes) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const u = await findUpdate(ctx, code)
  if (!u) return { error: "That update was removed." }
  const sources = (await live(ctx.db, "assets").whereIn("code", (codes ?? []).slice(0, 100)))
    .filter((a) => isFullAccess(ctx.permissions) || can(ctx.permissions, a.app, a.isPrivate ? "edit" : "view"))
    .filter((a) => IMAGE_TYPES.includes(a.mime))
  const added = await attachAssets(ctx.db, sources, { app: "portfolio", ownerType: "project_update", ownerId: u.id, collection: "images", userId: ctx.user.id })
  return { ok: true, added }
}

// ---------- events ----------

const eventSchema = z.object({
  type: z.string().min(1),
  title: z.string().trim().min(3, "Give the event a title.").max(200),
  startsAt: z.string().min(10, "Pick when it starts."),
  endsAt: z.string().optional().default(""),
  venue: z.string().trim().max(255).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum(["scheduled", "held", "cancelled"]).default("scheduled"),
})

// "2026-10-20T16:00" in Pakistan time → Date
const pkt = (s) => (s ? new Date(`${s.length === 10 ? `${s}T00:00` : s}:00+05:00`) : null)

export async function saveEvent(projectCode, input, code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const project = await findProject(ctx, projectCode)
  if (!project) return { error: "That project was removed." }
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const v = parsed.data
  const startsAt = pkt(v.startsAt)
  const endsAt = pkt(v.endsAt)
  if (!startsAt || Number.isNaN(startsAt.getTime())) return { fieldErrors: { startsAt: "Pick when it starts." } }
  if (endsAt && endsAt < startsAt) return { fieldErrors: { endsAt: "It can't end before it starts." } }
  const types = (await getLookups(ctx.db, ["event-type"]))["event-type"]
  const existing = code ? await live(ctx.db, "projectEvents").where({ code, projectId: project.id }).first("id", "type") : null
  if (code && !existing) return { error: "That event was removed." }
  if (v.type !== existing?.type && !isLookupValue(types, v.type)) return { fieldErrors: { type: "Pick a type from the list." } }
  const row = { type: v.type, title: v.title, startsAt, endsAt, venue: v.venue || null, description: v.description || null, status: v.status }
  if (existing)
    await ctx
      .db("projectEvents")
      .where({ id: existing.id })
      .update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
  else {
    await ctx.db("projectEvents").insert({ ...row, code: newCode(), projectId: project.id, createdBy: ctx.user.id })
    await logActivity(ctx.db, { type: "portfolio", action: "project.event_added", actorUserId: ctx.user.id, summary: `scheduled "${v.title}" for ${project.name}`, subjectType: "project", subjectId: project.id })
  }
  return { ok: true }
}

export async function deleteEvent(code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const e = await live(ctx.db, "projectEvents")
    .where({ code: String(code ?? "") })
    .first("id")
  if (!e) return { error: "That event was already removed." }
  await ctx.db("projectEvents").where({ id: e.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  return { ok: true }
}
