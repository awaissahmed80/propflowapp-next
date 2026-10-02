"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { normalizeHex } from "@/lib/color"
import { estateAction } from "./context"

// Create and edit projects with their phases and blocks. Blocks (and phases) that already hold
// inventory can't be removed.

const date = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
    .nullable(),
)
const text = (max) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional())
const optionalId = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable())

const blockSchema = z.object({ id: optionalId, name: z.string().trim().min(1, "Block name is required.").max(80), category: z.string() })
const phaseSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1, "Phase name is required.").max(80),
  stage: z.string(),
  status: z.string(),
  launchDate: date,
  possessionDate: date,
  blocks: z.array(blockSchema).min(1, "Each phase needs at least one block."),
})
const projectSchema = z.object({
  name: z.string().trim().min(2, "Project name is required.").max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "Use 2–6 letters or digits, e.g. SKE."),
  type: z.string(),
  status: z.string(),
  city: text(80),
  location: z.string().trim().min(3, "Address is required.").max(255),
  authority: text(40),
  approval: z.string(),
  nocNumber: text(80),
  launchDate: date,
  possessionDate: date,
  totalArea: z.coerce.number({ message: "Enter the total land area." }).positive("Enter the total land area.").max(1e8),
  areaUnit: z.enum(["kanal", "marla", "acre"]),
  marlaSqft: z.coerce.number().refine((v) => [225, 272.25].includes(v), "Pick a marla size."),
  color: z.preprocess((c) => normalizeHex(c), z.string({ message: "Pick a colour." })),
  description: text(2000),
  amenities: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  phases: z.array(phaseSchema).min(1, "Add at least one phase."),
})

const firstErrors = (error) => {
  const out = {}
  for (const i of error.issues) {
    const key = i.path.join(".")
    if (!out[key]) out[key] = i.message
  }
  return out
}

// Values must be in the workspace's lists
async function checkLists(ctx, v) {
  const lists = await getLookups(ctx.db, ["project-type", "project-status", "approval-status", "authority", "phase-stage", "block-category"])
  const errors = {}
  const check = (key, list, value, label, current) => {
    if (value && value !== current && !isLookupValue(lists[list], value)) errors[key] = `Pick ${label} from the list.`
  }
  check("type", "project-type", v.type, "a project type")
  check("status", "project-status", v.status, "a status")
  check("approval", "approval-status", v.approval, "an approval status")
  check("authority", "authority", v.authority, "an authority", v.currentAuthority)
  v.phases.forEach((ph, i) => {
    check(`phases.${i}.stage`, "phase-stage", ph.stage, "a stage")
    check(`phases.${i}.status`, "project-status", ph.status, "a status")
    ph.blocks.forEach((b, j) => check(`phases.${i}.blocks.${j}.category`, "block-category", b.category, "a category"))
  })
  return errors
}

// New project (no code) or changes to one → { ok, code } or { error, fieldErrors }
export async function saveProject(input, currentCode) {
  const { ctx, error } = await estateAction(currentCode ? "edit" : "create")
  if (error) return { error }
  const parsed = projectSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) }
  const v = parsed.data

  const errors = {}
  if (v.approval === "approved" && !v.nocNumber) errors.nocNumber = "Approved projects need their NOC / LOP number."
  if (v.launchDate && v.possessionDate && v.possessionDate < v.launchDate) errors.possessionDate = "Possession can't be before launch."
  v.phases.forEach((ph, i) => {
    if (ph.launchDate && ph.possessionDate && ph.possessionDate < ph.launchDate) errors[`phases.${i}.possessionDate`] = "Possession can't be before launch."
    const names = ph.blocks.map((b) => b.name.toLowerCase())
    ph.blocks.forEach((b, j) => {
      if (names.indexOf(b.name.toLowerCase()) !== j) errors[`phases.${i}.blocks.${j}.name`] = "Block names must be unique within a phase."
    })
  })

  const current = currentCode
    ? await live(ctx.db, "projects")
        .where({ code: String(currentCode).toUpperCase() })
        .first("id", "code", "authority")
    : null
  if (currentCode && !current) return { error: "That project was removed." }
  Object.assign(errors, await checkLists(ctx, { ...v, currentAuthority: current?.authority }))
  const clash = await live(ctx.db, "projects")
    .where({ code: v.code })
    .whereNot({ id: current?.id ?? 0 })
    .first("id")
  if (clash) errors.code = `Project code ${v.code} is already used in this workspace.`
  // The code is in every unit's code and file number, so it's fixed once there's inventory
  if (current && v.code !== current.code && (await live(ctx.db, "units").where({ projectId: current.id }).first("id"))) errors.code = "The code can't change once the project has inventory."
  if (Object.keys(errors).length) return { fieldErrors: errors }

  // Existing phases and blocks, and which blocks hold inventory
  const [oldPhases, oldBlocks, used] = current
    ? await Promise.all([
        live(ctx.db, "projectPhases").where({ projectId: current.id }).select("id", "name"),
        live(ctx.db, "projectBlocks").where({ projectId: current.id }).select("id", "phaseId", "name"),
        live(ctx.db, "units").where({ projectId: current.id }).distinct("blockId"),
      ])
    : [[], [], []]
  const usedBlocks = new Set(used.map((u) => u.blockId))
  const keptBlocks = new Set(v.phases.flatMap((ph) => ph.blocks.map((b) => b.id).filter(Boolean)))
  const removedBlocks = oldBlocks.filter((b) => !keptBlocks.has(b.id))
  if (removedBlocks.some((b) => usedBlocks.has(b.id))) return { error: "Blocks that already have inventory can't be removed." }
  // A block can't move between phases if it holds inventory
  for (const ph of v.phases)
    for (const b of ph.blocks) {
      const old = oldBlocks.find((x) => x.id === b.id)
      if (b.id && !old) return { error: "A block was removed by someone else. Reload and try again." }
      if (old && ph.id && old.phaseId !== ph.id && usedBlocks.has(old.id)) return { error: "Blocks that have inventory can't move to another phase." }
    }

  const row = {
    name: v.name,
    code: v.code,
    type: v.type,
    status: v.status,
    city: v.city ?? null,
    location: v.location,
    authority: v.authority ?? null,
    approval: v.approval,
    nocNumber: v.nocNumber ?? null,
    launchDate: v.launchDate,
    possessionDate: v.possessionDate,
    totalArea: v.totalArea,
    areaUnit: v.areaUnit,
    marlaSqft: v.marlaSqft,
    color: v.color.toLowerCase(),
    description: v.description ?? null,
    amenities: JSON.stringify(v.amenities),
  }
  const now = new Date()
  const userId = ctx.user.id
  await ctx.db.transaction(async (trx) => {
    let projectId = current?.id
    if (current)
      await trx("projects")
        .where({ id: projectId })
        .update({ ...row, updatedAt: now, updatedBy: userId })
    else [projectId] = await trx("projects").insert({ ...row, createdBy: userId })

    const keptPhases = new Set()
    for (const [i, ph] of v.phases.entries()) {
      const phRow = { name: ph.name, stage: ph.stage, status: ph.status, launchDate: ph.launchDate, possessionDate: ph.possessionDate, sortOrder: (i + 1) * 10 }
      let phaseId = ph.id && oldPhases.some((x) => x.id === ph.id) ? ph.id : null
      if (phaseId)
        await trx("projectPhases")
          .where({ id: phaseId })
          .update({ ...phRow, updatedAt: now, updatedBy: userId })
      else [phaseId] = await trx("projectPhases").insert({ ...phRow, projectId, createdBy: userId })
      keptPhases.add(phaseId)
      for (const [j, b] of ph.blocks.entries()) {
        const bRow = { name: b.name, category: b.category, phaseId, sortOrder: (j + 1) * 10 }
        if (b.id)
          await trx("projectBlocks")
            .where({ id: b.id })
            .update({ ...bRow, updatedAt: now, updatedBy: userId })
        else await trx("projectBlocks").insert({ ...bRow, projectId, createdBy: userId })
      }
    }
    if (removedBlocks.length)
      await trx("projectBlocks")
        .whereIn(
          "id",
          removedBlocks.map((b) => b.id),
        )
        .update({ deletedAt: now, deletedBy: userId })
    const removedPhases = oldPhases.filter((p) => !keptPhases.has(p.id))
    if (removedPhases.length)
      await trx("projectPhases")
        .whereIn(
          "id",
          removedPhases.map((p) => p.id),
        )
        .update({ deletedAt: now, deletedBy: userId })
  })
  await logActivity(ctx.db, {
    type: "estate",
    action: current ? "project.updated" : "project.created",
    actorUserId: userId,
    summary: current ? `updated project ${v.name}` : `created project ${v.name} (${v.code})`,
    subjectType: "project",
  })
  return { ok: true, code: v.code }
}
