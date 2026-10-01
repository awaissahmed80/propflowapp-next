import "server-only"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { latestFor } from "@/modules/approvals/server/requests"
import { getLookups } from "@/modules/lookups/server"
import { measures } from "../constants"

// Reads for price lists. Lists are versioned per project: draft → active → archived.

const num = (v) => (v == null ? null : Number(v))
// DATE columns → "2026-10-01"
const day = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : String(d ?? "").slice(0, 10))

// One list row → what pages use (parts parsed, numbers as numbers)
export function shapeList(l) {
  return {
    code: l.code,
    version: l.version,
    name: l.name,
    status: l.status,
    effectiveFrom: day(l.effectiveFrom),
    notes: l.notes ?? "",
    floorRisePct: Number(l.floorRisePct ?? 0),
    rates: (l.rates ?? []).map((r) => ({ ...r, sizeValue: num(r.sizeValue), rate: Number(r.rate) || 0 })),
    premiums: (l.premiums ?? []).map((p) => ({ feature: p.feature, percent: Number(p.percent) || 0 })),
    charges: (l.charges ?? []).map((c) => ({ ...c, amount: Number(c.amount) || 0 })),
    plans: l.plans ?? [],
    activatedAt: l.activatedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }
}

// The project's active list, or null
export async function activeList(db, projectId) {
  const l = await live(db, "priceLists").where({ projectId, status: "active" }).first()
  return l ? shapeList(l) : null
}

// Feature lookups with the list's premium % in place of each feature's default
export function withListPremiums(featureList, list) {
  if (!list) return featureList
  return featureList.map((f) => {
    const p = list.premiums.find((x) => x.feature === f.value)
    return p ? { ...f, meta: { ...(f.meta ?? {}), premium: p.percent } } : f
  })
}

// Every list, grouped by project, newest version first; projects without lists are included
export async function listPriceLists(ctx) {
  const [projects, lists] = await Promise.all([
    live(ctx.db, "projects").orderBy("sortOrder").orderBy("name").select("id", "code", "name", "color", "location", "type"),
    live(ctx.db, "priceLists").orderBy("version", "desc"),
  ])
  const people = await peopleByIds(lists.map((l) => l.createdBy))
  return projects.map((p) => ({
    project: { code: p.code, name: p.name, color: p.color, location: p.location, type: p.type },
    lists: lists.filter((l) => l.projectId === p.id).map((l) => ({ ...shapeList(l), createdBy: people.get(l.createdBy)?.name ?? null })),
  }))
}

// One list with its project and the project's units (for impact, rate counts and the calculator)
export async function getPriceList(ctx, code) {
  const l = await live(ctx.db, "priceLists")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!l) return null
  const [project, units, request, people] = await Promise.all([
    live(ctx.db, "projects").where({ id: l.projectId }).first("code", "name", "color", "type", "marlaSqft", "location"),
    live(ctx.db, "units").where({ projectId: l.projectId }).select("code", "number", "type", "category", "sizeValue", "sizeUnit", "areaSqft", "floor", "features", "price", "status"),
    latestFor(ctx.db, "price_list", l.id),
    peopleByIds([l.createdBy, l.activatedBy]),
  ])
  const who = request ? await peopleByIds([request.requestedBy, request.decidedBy]) : new Map()
  return {
    ...shapeList(l),
    createdBy: people.get(l.createdBy)?.name ?? null,
    activatedBy: people.get(l.activatedBy)?.name ?? null,
    project: { ...project, marlaSqft: Number(project.marlaSqft) },
    // The latest approval request: shown while waiting, or when it was sent back
    request: request
      ? {
          code: request.code,
          status: request.status,
          reason: request.reason,
          note: request.decisionNote,
          apply: request.payload?.apply !== false,
          requestedAt: request.createdAt,
          decidedAt: request.decidedAt,
          byMe: request.requestedBy === ctx.user?.id,
          requester: who.get(request.requestedBy)?.name ?? null,
          decider: who.get(request.decidedBy)?.name ?? null,
        }
      : null,
    units: units.map((u) => ({ ...u, sizeValue: Number(u.sizeValue), price: Number(u.price), features: u.features ?? [] })),
  }
}

// Active lists by project code, for pricing new inventory
export async function activeListsByProject(ctx) {
  const rows = await ctx.db("priceLists as l")
    .join("projects as p", "p.id", "l.projectId")
    .whereNull("l.deletedAt")
    .whereNull("p.deletedAt")
    .where("l.status", "active")
    .select("l.*", "p.code as projectCode")
  return Object.fromEntries(rows.map((l) => [l.projectCode, shapeList(l)]))
}

// A printed schedule's unit from its query string (see scheduleQuery in price-calculator.jsx):
// ?unit=ske-0001, or ?type=plot&category=residential&size=5-marla; plus features, floor, plan, start
export function scheduleInput(list, q) {
  const unit = q.unit ? list.units.find((u) => u.code.toLowerCase() === String(q.unit).toLowerCase()) : null
  const [sizeValue, sizeUnit] = String(q.size ?? "").split("-")
  return {
    unit,
    input: {
      type: unit?.type ?? String(q.type ?? ""),
      category: unit?.category ?? String(q.category ?? ""),
      sizeValue: unit?.sizeValue ?? Number(sizeValue),
      sizeUnit: unit?.sizeUnit ?? sizeUnit,
      floor: unit?.floor ?? (Number(q.floor) || null),
      features: q.features ? String(q.features).split(",").slice(0, 20) : [],
    },
    planKey: String(q.plan ?? ""),
    start: /^\d{4}-\d{2}-\d{2}$/.test(q.start ?? "") ? q.start : new Date().toISOString().slice(0, 10),
  }
}

// Labels for PDFs (no lookups context on the server)
export async function pdfLabels(db) {
  const lists = await getLookups(db, ["unit-type", "block-category", "feature", "area-unit"])
  const label = (key) => (v) => lists[key].find((x) => x.value === v)?.label ?? v
  return { type: label("unit-type"), category: label("block-category"), feature: label("feature"), featurePremium: (f) => Number(lists.feature.find((x) => x.value === f)?.meta?.premium ?? 0), m: measures(lists) }
}
