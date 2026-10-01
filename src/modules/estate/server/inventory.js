"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { measures, priceFor, round1000, standardDimensions } from "../constants"
import { estateAction } from "./context"
import { activeList, withListPremiums } from "./price-list-queries"

// Inventory: add units (one, or a numbered series), and change them one at a time or in bulk:
// hold / extend / release, block / unblock, allocate to a dealer's quota, reprice.
// Bulk actions skip units they don't apply to and say how many were changed and skipped.

const MAX_UNITS = 500
const HOLD_HOURS = [24, 48, 72]

// Unit codes per project: SKE-0001, SKE-0002…
async function unitCodes(trx, projectCode, n) {
  const key = `unit:${projectCode}`
  await trx("sequences").insert({ key, prefix: projectCode, format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", nextValue: 1 }).onConflict("key").ignore()
  const codes = []
  for (let i = 0; i < n; i++) codes.push(await nextCode(trx, key))
  return codes
}

// "SKE-F-" 1001…1050 → ["SKE-F-1001", …]
const series = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`)

const optionalInt = (min, max) => z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable())
const sizeUnitSchema = z.string().trim().min(1).max(20) // an Area units value; checked against the type below

const addSchema = z.object({
  projectCode: z.string(),
  phaseId: z.coerce.number().int().positive("Pick a phase."),
  blockId: z.coerce.number().int().positive("Pick a block."),
  type: z.string().min(1, "Pick a unit type."),
  numbering: z.enum(["series", "single"]),
  prefix: z.string().trim().max(20).optional().default(""),
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
  number: z.string().trim().max(40).optional().default(""),
  // "same": one size and set of features for every unit; "mixed": rows, one per unit number
  sizing: z.enum(["same", "mixed"]).default("same"),
  sizeValue: z.coerce.number().positive("Enter the unit size.").optional(),
  sizeUnit: sizeUnitSchema.optional(),
  features: z.array(z.string()).max(20).default([]),
  rows: z
    .array(z.object({ number: z.string().trim().min(1).max(40), sizeValue: z.coerce.number().positive("Every unit needs a size."), sizeUnit: sizeUnitSchema, features: z.array(z.string()).max(20).default([]) }))
    .max(MAX_UNITS)
    .optional(),
  street: z.string().trim().max(60).optional().default(""),
  floor: optionalInt(-5, 200),
  bedrooms: optionalInt(0, 20),
  rate: z.coerce.number({ message: "Enter the base rate." }).positive("Enter the base rate."),
  status: z.enum(["available", "blocked"]).default("available"),
})

// Area, dimensions, premiums and prices of one unit from its size, features and base rate.
// Files have no features, premiums or dimensions.
function figures({ type, sizeValue, sizeUnit, features, rate, marlaSqft, featureList, m }) {
  const isFile = type === "file"
  const own = isFile ? [] : [...new Set(features)].filter((f) => isLookupValue(featureList, f) || featureList.some((x) => x.value === f))
  const premiums = own.map((f) => ({ feature: f, percent: Number(featureList.find((x) => x.value === f)?.meta?.premium ?? 0) }))
  const { base, price } = priceFor({ rate, value: sizeValue, unit: sizeUnit, marlaSqft, premiums, m })
  return {
    sizeValue,
    sizeUnit,
    areaSqft: m.areaSqft(sizeValue, sizeUnit, marlaSqft),
    dimensions: isFile || m.sizedInSqft(type) ? null : standardDimensions(marlaSqft, m.sizeInMarla(sizeValue, sizeUnit), "marla"),
    features: JSON.stringify(own),
    premiums: JSON.stringify(premiums),
    baseRate: rate,
    basePrice: base,
    price: isFile ? base : price,
  }
}

// The workspace's sizing rules (Area units, Unit types, Block categories)
const workspaceMeasures = async (db) => measures(await getLookups(db, ["area-unit", "unit-type", "block-category"]))
const sizeError = (m, type, unit) => (m.unitsFor(type).includes(unit) ? null : `Size this type in ${m.unitsFor(type).map(m.unitShort).join(", ")}.`)

// → { ok, added, blockName } or { error, fieldErrors }
export async function addUnits(input) {
  const { ctx, error } = await estateAction("create")
  if (error) return { error }
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data

  const project = await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id", "code", "name", "marlaSqft")
  if (!project) return { error: "That project was removed." }
  const phase = await live(ctx.db, "projectPhases").where({ id: v.phaseId, projectId: project.id }).first("id", "name", "stage")
  if (!phase) return { fieldErrors: { phaseId: "Pick a phase of this project." } }
  const block = await live(ctx.db, "projectBlocks").where({ id: v.blockId, phaseId: phase.id }).first("id", "name", "category")
  if (!block) return { fieldErrors: { blockId: "Pick a block in this phase." } }

  const unballoted = phase.stage === "unballoted"
  const m = await workspaceMeasures(ctx.db)
  const allowed = m.typesFor(block.category, { unballoted })
  if (!allowed.includes(v.type)) return { fieldErrors: { type: unballoted ? "Unballoted phases hold files only." : `A ${block.category} block can't hold this type.` } }

  // Each unit: its number, size and features
  let units
  if (v.sizing === "mixed" && v.numbering === "series") {
    if (!v.rows?.length) return { fieldErrors: { rows: "Add the units and their sizes." } }
    const bad = v.rows.find((r) => sizeError(m, v.type, r.sizeUnit))
    if (bad) return { fieldErrors: { rows: `${bad.number}: ${sizeError(m, v.type, bad.sizeUnit)}` } }
    const seen = new Set()
    const dup = v.rows.find((r) => (seen.has(r.number) ? true : (seen.add(r.number), false)))
    if (dup) return { fieldErrors: { rows: `${dup.number} is in the list twice.` } }
    units = v.rows.map((r) => ({ number: r.number, sizeValue: r.sizeValue, sizeUnit: r.sizeUnit, features: r.features }))
  } else {
    if (!(v.sizeValue > 0) || !v.sizeUnit) return { fieldErrors: { sizeValue: "Enter the unit size." } }
    const err = sizeError(m, v.type, v.sizeUnit)
    if (err) return { fieldErrors: { sizeValue: err } }
    let numbers
    if (v.numbering === "single") {
      if (!v.number) return { fieldErrors: { number: "Enter the unit number." } }
      numbers = [v.number]
    } else {
      if (v.from == null || v.to == null || v.to < v.from) return { fieldErrors: { from: "Enter a valid From and To range." } }
      if (v.to - v.from + 1 > MAX_UNITS) return { fieldErrors: { to: `Add at most ${MAX_UNITS} units at a time.` } }
      numbers = series(v.prefix, v.from, v.to)
    }
    units = numbers.map((number) => ({ number, sizeValue: v.sizeValue, sizeUnit: v.sizeUnit, features: v.features }))
  }

  const numbers = units.map((u) => u.number)
  const existing = new Set((await live(ctx.db, "units").where({ blockId: block.id }).whereIn("number", numbers).select("number")).map((u) => u.number))
  const dupes = numbers.filter((n) => existing.has(n))
  if (dupes.length) return { fieldErrors: { [v.numbering === "single" ? "number" : v.sizing === "mixed" ? "rows" : "from"]: `${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? "…" : ""} already ${dupes.length === 1 ? "exists" : "exist"} in ${block.name}.` } }

  const lists = await getLookups(ctx.db, ["unit-type", "feature"])
  if (!isLookupValue(lists["unit-type"], v.type)) return { fieldErrors: { type: "Pick a unit type." } }
  const featureList = withListPremiums(lists.feature.filter((f) => f.isActive), await activeList(ctx.db, project.id))
  const shared = {
    projectId: project.id,
    phaseId: phase.id,
    blockId: block.id,
    type: v.type,
    category: block.category,
    street: ["plot", "house", "farmhouse"].includes(v.type) ? v.street || null : null,
    floor: m.sizedInSqft(v.type) ? v.floor : null,
    bedrooms: ["house", "apartment"].includes(v.type) ? v.bedrooms : null,
    status: v.status,
    blockReason: v.status === "blocked" ? "Added as blocked" : null,
    createdBy: ctx.user.id,
  }
  await ctx.db.transaction(async (trx) => {
    const codes = await unitCodes(trx, project.code, units.length)
    const rows = units.map((u, i) => ({ ...shared, ...figures({ type: v.type, ...u, rate: v.rate, marlaSqft: project.marlaSqft, featureList, m }), code: codes[i], number: u.number }))
    for (let i = 0; i < rows.length; i += 200) await trx("units").insert(rows.slice(i, i + 200))
  })
  await logActivity(ctx.db, { type: "estate", action: "units.added", actorUserId: ctx.user.id, summary: `added ${units.length} ${lists["unit-type"].find((t) => t.value === v.type)?.label.toLowerCase() ?? "unit"}${units.length === 1 ? "" : "s"} to ${project.name} · ${block.name}`, subjectType: "project", subjectId: project.id })
  return { ok: true, added: units.length, blockName: block.name }
}

const editSchema = z.object({
  sizeValue: z.coerce.number({ message: "Enter the size." }).positive("Enter the size."),
  sizeUnit: sizeUnitSchema,
  features: z.array(z.string()).max(20).default([]),
  street: z.string().trim().max(60).optional().default(""),
  floor: optionalInt(-5, 200),
  bedrooms: optionalInt(0, 20),
})

// Change one unsold unit's size, features, street, floor or bedrooms; its price is recalculated
// from its own base rate. → { ok } or { error, fieldErrors }
export async function updateUnit(code, input) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const u = await live(ctx.db, "units").where({ code: String(code ?? "").toUpperCase() }).first()
  if (!u) return { error: "That unit was removed." }
  if (!["available", "on-hold", "blocked"].includes(u.status)) return { error: "Booked and sold units keep their size and price." }
  const parsed = editSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const m = await workspaceMeasures(ctx.db)
  const err = sizeError(m, u.type, v.sizeUnit)
  if (err) return { fieldErrors: { sizeValue: err } }
  const project = await ctx.db("projects").where({ id: u.projectId }).first("marlaSqft", "name")
  const featureList = withListPremiums((await getLookups(ctx.db, ["feature"])).feature, await activeList(ctx.db, u.projectId))
  // The unit's own rate (older units: from their base price and size)
  const rate = Number(u.baseRate) || Number(u.basePrice) / (m.sizeInMarla(u.sizeValue, u.sizeUnit) ?? (u.areaSqft || 1))
  // Features it already has stay, even if switched off in the list since
  const keep = (u.features ?? []).filter((f) => v.features.includes(f))
  const fresh = v.features.filter((f) => !keep.includes(f) && isLookupValue(featureList, f))
  const f = figures({ type: u.type, sizeValue: v.sizeValue, sizeUnit: v.sizeUnit, features: [...keep, ...fresh], rate, marlaSqft: project.marlaSqft, featureList, m })
  await ctx.db("units")
    .where({ id: u.id })
    .update({
      ...f,
      street: ["plot", "house", "farmhouse"].includes(u.type) ? v.street || null : null,
      floor: m.sizedInSqft(u.type) ? v.floor : null,
      bedrooms: ["house", "apartment"].includes(u.type) ? v.bedrooms : null,
      updatedAt: new Date(),
      updatedBy: ctx.user.id,
    })
  await logActivity(ctx.db, { type: "estate", action: "unit.updated", actorUserId: ctx.user.id, summary: `updated ${u.number} in ${project.name} (now ${round1000(f.price).toLocaleString("en-PK")})`, subjectType: "unit", subjectId: u.id })
  return { ok: true }
}

// ---------- changing units ----------

// Units by code in this workspace, with their project
async function unitsByCode(ctx, codes) {
  const list = [...new Set((Array.isArray(codes) ? codes : [codes]).map((c) => String(c).toUpperCase()))].slice(0, 2000)
  if (!list.length) return []
  return live(ctx.db, "units").whereIn("code", list).select("id", "code", "projectId", "status", "dealerId", "sizeValue", "sizeUnit", "areaSqft", "basePrice", "baseRate", "premiums", "type")
}

// Apply patchFor(unit) (null: skip) to each unit; log one line
async function change(ctx, codes, patchFor, summary) {
  const units = await unitsByCode(ctx, codes)
  if (!units.length) return { error: "Those units weren't found." }
  const now = new Date()
  let changed = 0
  await ctx.db.transaction(async (trx) => {
    for (const u of units) {
      const patch = patchFor(u)
      if (!patch) continue
      await trx("units").where({ id: u.id }).update({ ...patch, updatedAt: now, updatedBy: ctx.user.id })
      changed++
    }
  })
  if (changed) await logActivity(ctx.db, { type: "estate", action: "units.changed", actorUserId: ctx.user.id, summary: summary(changed), details: { codes: units.slice(0, 50).map((u) => u.code) } })
  return { ok: true, changed, skipped: units.length - changed }
}

const label = (n) => (n === 1 ? "1 unit" : `${n} units`)

// Hold (or extend a hold) for 24 / 48 / 72 hours with a reason
export async function holdUnits(codes, { hours, reason } = {}) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  if (!HOLD_HOURS.includes(Number(hours))) return { error: "Hold for 24, 48 or 72 hours." }
  const reasons = (await getLookups(ctx.db, ["hold-reason"]))["hold-reason"]
  if (!isLookupValue(reasons, reason)) return { error: "Pick why it's on hold." }
  const expires = new Date(Date.now() + Number(hours) * 3_600_000)
  return change(ctx, codes, (u) => (["available", "on-hold"].includes(u.status) ? { status: "on-hold", holdBy: ctx.user.id, holdReason: reason, holdExpiresAt: expires } : null), (n) => `put ${label(n)} on hold for ${hours} hours`)
}

export async function releaseHolds(codes) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  return change(ctx, codes, (u) => (u.status === "on-hold" ? { status: "available", holdBy: null, holdReason: null, holdExpiresAt: null } : null), (n) => `released ${label(n)} from hold`)
}

export async function blockUnits(codes, reason) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 3) return { error: "Give a reason, e.g. litigation or management reserve." }
  return change(ctx, codes, (u) => (u.status === "available" ? { status: "blocked", blockReason: why.slice(0, 255) } : null), (n) => `blocked ${label(n)} (${why.slice(0, 60)})`)
}

export async function unblockUnits(codes) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  return change(ctx, codes, (u) => (u.status === "blocked" ? { status: "available", blockReason: null } : null), (n) => `unblocked ${label(n)}`)
}

// Into a dealer's quota (dealerCode) or back to company stock (null)
export async function allocateUnits(codes, dealerCode) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  let dealer = null
  if (dealerCode) {
    dealer = await live(ctx.db, "dealers").where({ code: String(dealerCode).toUpperCase() }).first("id", "name", "isActive")
    if (!dealer) return { error: "That dealer was removed." }
    if (!dealer.isActive) return { error: `${dealer.name} is inactive.` }
  }
  return change(
    ctx,
    codes,
    (u) => {
      if (!["available", "on-hold"].includes(u.status)) return null
      if (dealer ? u.dealerId === dealer.id : !u.dealerId) return null
      return { dealerId: dealer?.id ?? null }
    },
    (n) => (dealer ? `allocated ${label(n)} to ${dealer.name}` : `returned ${label(n)} to company stock`)
  )
}

// Unsold units only: by a percentage, or to a new rate per marla / sq ft; premiums re-applied
export async function repriceUnits(codes, { mode, value } = {}) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const v = Number(value)
  if (!Number.isFinite(v)) return { error: mode === "rate" ? "Enter the new rate." : "Enter a percentage." }
  if (mode === "percent" && (v <= -90 || v > 500)) return { error: "Use a percentage between -90 and 500." }
  if (mode === "rate" && v <= 0) return { error: "Enter the new rate." }
  const m = await workspaceMeasures(ctx.db)
  return change(
    ctx,
    codes,
    (u) => {
      if (!["available", "on-hold", "blocked"].includes(u.status)) return null
      const size = m.sizeInMarla(u.sizeValue, u.sizeUnit) ?? u.areaSqft
      const oldRate = Number(u.baseRate) || Number(u.basePrice) / (size || 1)
      const rate = mode === "rate" ? v : oldRate * (1 + v / 100)
      const base = round1000(size * rate)
      const pct = (u.type === "file" ? [] : (u.premiums ?? [])).reduce((s, p) => s + Number(p.percent || 0), 0)
      return { baseRate: Math.round(rate * 100) / 100, basePrice: base, price: u.type === "file" ? base : round1000(base * (1 + pct / 100)) }
    },
    (n) => (mode === "rate" ? `repriced ${label(n)} to a base rate of Rs ${v.toLocaleString("en-PK")}` : `repriced ${label(n)} by ${v > 0 ? "+" : ""}${v}%`)
  )
}
