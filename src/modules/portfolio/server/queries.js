import "server-only"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { getLookups } from "@/modules/lookups/server"
import { assetUrl, coversFor, listAssets } from "@/server/assets"
import { peopleByIds } from "@/modules/users/server/queries"
import { summarize } from "../constants"
import { activeListsByProject } from "./price-list-queries"

// Reads for Project Portfolio. Money comes back as numbers (decimalNumbers), dates as Date.

export const ESTATE_LISTS = [
  "project-type",
  "project-status",
  "approval-status",
  "authority",
  "phase-stage",
  "block-category",
  "unit-type",
  "unit-status",
  "feature",
  "hold-reason",
  "marla-size",
  "area-unit",
  "city",
  "project-document-type",
  "development-work",
  "update-type",
  "event-type",
]
export const estateLists = (ctx) => getLookups(ctx.db, ESTATE_LISTS)

// Holds end on their own: units whose hold has run out go back on sale. Runs before reads.
export async function releaseExpiredHolds(ctx) {
  const expired = await live(ctx.db, "units").where({ status: "on-hold" }).where("holdExpiresAt", "<=", new Date()).select("id", "code")
  if (!expired.length) return
  await ctx
    .db("units")
    .whereIn(
      "id",
      expired.map((u) => u.id),
    )
    .update({ status: "available", holdBy: null, holdReason: null, holdExpiresAt: null, updatedAt: new Date() })
  await logActivity(ctx.db, {
    type: "portfolio",
    action: "unit.hold_expired",
    summary: `released ${expired.length} expired ${expired.length === 1 ? "hold" : "holds"} (${expired
      .slice(0, 5)
      .map((u) => u.code)
      .join(", ")}${expired.length > 5 ? "…" : ""})`,
  })
}

const UNIT_FIELDS = ["id", "code", "projectId", "phaseId", "blockId", "number", "type", "category", "sizeValue", "sizeUnit", "areaSqft", "price", "basePrice", "status", "dealerId"]

// Projects with their phase/block counts, unit types and availability
export async function listProjects(ctx) {
  await releaseExpiredHolds(ctx)
  const [projects, phases, blocks, units] = await Promise.all([
    live(ctx.db, "projects").orderBy("sortOrder").orderBy("name"),
    live(ctx.db, "projectPhases").select("id", "projectId"),
    live(ctx.db, "projectBlocks").select("id", "projectId"),
    live(ctx.db, "units").select(UNIT_FIELDS),
  ])
  const covers = await coversFor(
    ctx.db,
    "project",
    projects.map((p) => p.id),
  )
  return projects.map((p) => {
    const mine = units.filter((u) => u.projectId === p.id)
    return {
      ...p,
      coverUrl: covers.get(p.id) ?? null,
      amenities: p.amenities ?? [],
      phaseCount: phases.filter((x) => x.projectId === p.id).length,
      blockCount: blocks.filter((x) => x.projectId === p.id).length,
      unitTypes: [...new Set(mine.map((u) => u.type))],
      stats: summarize(mine),
    }
  })
}

// One project by its code (any case), with phases → blocks and their availability, and the unit
// mix (units grouped by type and size). null when it isn't in this workspace.
export async function getProject(ctx, code) {
  await releaseExpiredHolds(ctx)
  const project = await live(ctx.db, "projects")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!project) return null
  const [phases, blocks, units, assets] = await Promise.all([
    live(ctx.db, "projectPhases").where({ projectId: project.id }).orderBy("sortOrder").orderBy("id"),
    live(ctx.db, "projectBlocks").where({ projectId: project.id }).orderBy("sortOrder").orderBy("id"),
    live(ctx.db, "units").where({ projectId: project.id }).select(UNIT_FIELDS),
    listAssets(ctx.db, { ownerType: "project", ownerId: project.id }),
  ])
  const [progress, updates, events] = await Promise.all([
    live(ctx.db, "projectProgress").where({ projectId: project.id }).select("phaseId", "work", "percent", "updatedAt", "createdAt"),
    live(ctx.db, "projectUpdates").where({ projectId: project.id }).orderBy("postedAt", "desc").orderBy("id", "desc").limit(100),
    live(ctx.db, "projectEvents").where({ projectId: project.id }).orderBy("startsAt"),
  ])
  const updateIds = updates.map((u) => u.id)
  const [photos, authors] = await Promise.all([
    updateIds.length ? live(ctx.db, "assets").where({ ownerType: "project_update", collection: "images" }).whereIn("ownerId", updateIds).orderBy("sortOrder").select("ownerId", "code", "title") : [],
    peopleByIds(updates.map((u) => u.createdBy)),
  ])
  const mixMap = new Map()
  for (const u of units) {
    const key = `${u.type}|${Number(u.sizeValue)}|${u.sizeUnit}`
    if (!mixMap.has(key)) mixMap.set(key, { key, type: u.type, sizeValue: Number(u.sizeValue), sizeUnit: u.sizeUnit, units: [] })
    mixMap.get(key).units.push(u)
  }
  const sizeOrder = (r) => (r.sizeUnit === "kanal" ? r.sizeValue * 20 : r.sizeValue)
  const unitMix = [...mixMap.values()]
    .map(({ units: list, ...r }) => ({ ...r, stats: summarize(list), minPrice: Math.min(...list.map((u) => Number(u.price))), maxPrice: Math.max(...list.map((u) => Number(u.price))) }))
    .sort((a, b) => a.type.localeCompare(b.type) || sizeOrder(a) - sizeOrder(b))
  return {
    ...project,
    amenities: project.amenities ?? [],
    images: assets.filter((a) => a.collection === "images"),
    documents: assets.filter((a) => a.collection === "documents"),
    coverUrl: assets.find((a) => a.collection === "images" && a.isCover)?.url ?? null,
    progress: progress.map((r) => ({ phaseId: r.phaseId, work: r.work, percent: r.percent, updatedAt: r.updatedAt ?? r.createdAt })),
    updates: updates.map((u) => ({
      code: u.code,
      type: u.type,
      title: u.title,
      body: u.body,
      phaseId: u.phaseId,
      changes: u.changes ?? [],
      postedAt: u.postedAt,
      author: authors.get(u.createdBy)?.name ?? null,
      photos: photos.filter((ph) => ph.ownerId === u.id).map((ph) => ({ code: ph.code, title: ph.title, url: assetUrl(ph.code) })),
    })),
    events: events.map((e) => ({ code: e.code, type: e.type, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, venue: e.venue, description: e.description, status: e.status })),
    stats: summarize(units),
    onHold: units.filter((u) => u.status === "on-hold").length,
    phases: phases.map((ph) => {
      const phUnits = units.filter((u) => u.phaseId === ph.id)
      return {
        ...ph,
        stats: summarize(phUnits),
        blocks: blocks
          .filter((b) => b.phaseId === ph.id)
          .map((b) => {
            const bUnits = phUnits.filter((u) => u.blockId === b.id)
            return { ...b, stats: summarize(bUnits), unitTypes: [...new Set(bUnits.map((u) => u.type))], hasUnits: bUnits.length > 0 }
          }),
      }
    }),
    unitMix,
  }
}

// Every unit with its project, phase, block, dealer and who's holding it
export async function listInventory(ctx) {
  await releaseExpiredHolds(ctx)
  const [units, projects, phases, blocks, dealers] = await Promise.all([
    live(ctx.db, "units").orderBy("projectId").orderBy("blockId").orderBy("id"),
    live(ctx.db, "projects").select("id", "code", "name", "color", "marlaSqft", "type"),
    live(ctx.db, "projectPhases").select("id", "name", "stage"),
    live(ctx.db, "projectBlocks").select("id", "name", "category"),
    ctx.db("dealers").select("id", "code", "name", "city"),
  ])
  const holders = await peopleByIds(units.map((u) => u.holdBy))
  const byId = (list) => new Map(list.map((x) => [x.id, x]))
  const [P, Ph, B, D] = [byId(projects), byId(phases), byId(blocks), byId(dealers)]
  return units.map((u) => {
    const p = P.get(u.projectId)
    const d = D.get(u.dealerId)
    return {
      code: u.code,
      number: u.number,
      type: u.type,
      category: u.category,
      sizeValue: Number(u.sizeValue),
      sizeUnit: u.sizeUnit,
      areaSqft: u.areaSqft,
      street: u.street,
      dimensions: u.dimensions,
      floor: u.floor,
      bedrooms: u.bedrooms,
      features: u.features ?? [],
      premiums: u.premiums ?? [],
      basePrice: Number(u.basePrice),
      baseRate: Number(u.baseRate) || null,
      price: Number(u.price),
      status: u.status,
      blockReason: u.blockReason,
      hold: u.status === "on-hold" ? { by: holders.get(u.holdBy)?.name ?? null, byMe: u.holdBy === ctx.user.id, reason: u.holdReason, expiresAt: u.holdExpiresAt } : null,
      project: p ? { code: p.code, name: p.name, color: p.color, marlaSqft: Number(p.marlaSqft) } : null,
      phase: Ph.get(u.phaseId) ? { id: u.phaseId, name: Ph.get(u.phaseId).name, stage: Ph.get(u.phaseId).stage } : null,
      block: B.get(u.blockId) ? { id: u.blockId, name: B.get(u.blockId).name } : null,
      dealer: d ? { code: d.code, name: d.name, city: d.city } : null,
    }
  })
}

// Projects → phases → blocks, for adding inventory
export async function projectTree(ctx) {
  const [projects, phases, blocks, lists] = await Promise.all([
    live(ctx.db, "projects").orderBy("name").select("id", "code", "name", "color", "marlaSqft"),
    live(ctx.db, "projectPhases").orderBy("sortOrder").orderBy("id").select("id", "projectId", "name", "stage"),
    live(ctx.db, "projectBlocks").orderBy("sortOrder").orderBy("id").select("id", "phaseId", "name", "category"),
    activeListsByProject(ctx),
  ])
  return projects.map((p) => ({
    code: p.code,
    priceList: lists[p.code] ? { version: lists[p.code].version, rates: lists[p.code].rates, premiums: lists[p.code].premiums } : null,
    name: p.name,
    color: p.color,
    marlaSqft: Number(p.marlaSqft),
    phases: phases
      .filter((ph) => ph.projectId === p.id)
      .map((ph) => ({ id: ph.id, name: ph.name, stage: ph.stage, blocks: blocks.filter((b) => b.phaseId === ph.id).map((b) => ({ id: b.id, name: b.name, category: b.category })) })),
  }))
}

export const activeDealers = (ctx) => live(ctx.db, "dealers").where({ isActive: true }).orderBy("name").select("code", "name", "city")
