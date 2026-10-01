"use server"

import { z } from "zod"
import { live, withTrashed } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups } from "@/modules/lookups/server"
import { measures } from "../constants"
import { createApproval, pendingFor } from "@/modules/approvals/server/requests"
import { STARTER_CHARGES, STARTER_PLANS } from "../pricing"
import { estateAction } from "./context"
import { activateList, activationProblem, applyList, listByCode, returnToDraft } from "./price-list-ops"
import { shapeList } from "./price-list-queries"

// Price lists: create a draft (copying the active list, the current inventory prices, or
// blank), edit it, activate it (approvers; the previous active list is archived, and unsold
// units can be re-priced), apply the active list to inventory again, or delete a draft.

const pct = z.coerce.number().min(0).max(100)
const today = () => new Date().toISOString().slice(0, 10)



// Rates from what the project's units are priced at now: one row per type, category and size,
// at the most common rate among them
async function ratesFromInventory(ctx, projectId) {
  const [units, lists] = await Promise.all([live(ctx.db, "units").where({ projectId }).select("type", "category", "sizeValue", "sizeUnit", "areaSqft", "baseRate", "basePrice"), getLookups(ctx.db, ["area-unit", "unit-type", "block-category"])])
  const { sizeInMarla } = measures(lists)
  const groups = new Map()
  for (const u of units) {
    const k = `${u.type}|${u.category}|${Number(u.sizeValue)}|${u.sizeUnit}`
    const rate = Math.round(Number(u.baseRate) || Number(u.basePrice) / (sizeInMarla(Number(u.sizeValue), u.sizeUnit) ?? (u.areaSqft || 1)))
    if (!groups.has(k)) groups.set(k, { type: u.type, category: u.category, sizeValue: Number(u.sizeValue), sizeUnit: u.sizeUnit, rates: new Map() })
    const g = groups.get(k)
    g.rates.set(rate, (g.rates.get(rate) ?? 0) + 1)
  }
  return [...groups.values()]
    .sort((a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || (sizeInMarla(a.sizeValue, a.sizeUnit) ?? a.sizeValue) - (sizeInMarla(b.sizeValue, b.sizeUnit) ?? b.sizeValue))
    .map((g, i) => ({ key: `r${i + 1}`, type: g.type, category: g.category, sizeValue: g.sizeValue, sizeUnit: g.sizeUnit, rate: [...g.rates].sort((a, b) => b[1] - a[1])[0][0] }))
}

const createSchema = z.object({
  projectCode: z.string().min(1, "Pick a project."),
  source: z.string().min(1), // "active" | "inventory" | "blank" | a list code
  name: z.string().trim().min(2, "Give the price list a name.").max(150),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it takes effect."),
})

// New draft → { ok, code } or { error, fieldErrors }
export async function createPriceList(input) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const project = await live(ctx.db, "projects").where({ code: v.projectCode.toUpperCase() }).first("id", "code", "name")
  if (!project) return { fieldErrors: { projectCode: "That project was removed." } }

  const features = (await getLookups(ctx.db, ["feature"])).feature.filter((f) => f.isActive)
  const defaultPremiums = features.filter((f) => Number(f.meta?.premium) > 0).map((f) => ({ feature: f.value, percent: Number(f.meta.premium) }))
  let parts
  if (v.source === "inventory" || v.source === "blank") {
    parts = { rates: v.source === "inventory" ? await ratesFromInventory(ctx, project.id) : [], premiums: defaultPremiums, charges: STARTER_CHARGES, plans: STARTER_PLANS, floorRisePct: 0, notes: "" }
  } else {
    const from = v.source === "active" ? await live(ctx.db, "priceLists").where({ projectId: project.id, status: "active" }).first() : await listByCode(ctx.db, v.source)
    if (!from || from.projectId !== project.id) return { fieldErrors: { source: "That price list isn't available to copy." } }
    const s = shapeList(from)
    parts = { rates: s.rates, premiums: s.premiums, charges: s.charges, plans: s.plans, floorRisePct: s.floorRisePct, notes: s.notes }
  }

  let code
  await ctx.db.transaction(async (trx) => {
    const last = await withTrashed(trx, "priceLists").where({ projectId: project.id }).max("version as v").first()
    code = await nextCode(trx, "price-list")
    await trx("priceLists").insert({
      code,
      projectId: project.id,
      version: (last?.v ?? 0) + 1,
      name: v.name,
      status: "draft",
      effectiveFrom: v.effectiveFrom,
      notes: parts.notes || null,
      floorRisePct: parts.floorRisePct,
      rates: JSON.stringify(parts.rates),
      premiums: JSON.stringify(parts.premiums),
      charges: JSON.stringify(parts.charges),
      plans: JSON.stringify(parts.plans),
      createdBy: ctx.user.id,
    })
  })
  await logActivity(ctx.db, { type: "estate", action: "price_list.created", actorUserId: ctx.user.id, summary: `started ${v.name} (${code}) for ${project.name}`, subjectType: "project", subjectId: project.id })
  return { ok: true, code }
}

const saveSchema = z.object({
  name: z.string().trim().min(2, "Give the price list a name.").max(150),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it takes effect."),
  notes: z.string().trim().max(2000).optional().default(""),
  floorRisePct: z.coerce.number().min(0).max(10).default(0),
  rates: z
    .array(
      z.object({
        key: z.string().max(10),
        type: z.string().min(1).max(40),
        category: z.string().min(1).max(20),
        sizeValue: z.coerce.number().positive().nullable(),
        sizeUnit: z.string().trim().min(1).max(20).nullable(),
        rate: z.coerce.number().min(0).max(1e10),
      }),
    )
    .max(200),
  premiums: z.array(z.object({ feature: z.string().min(1).max(60), percent: pct })).max(50),
  charges: z.array(z.object({ key: z.string().max(10), name: z.string().trim().min(1, "Name every charge.").max(120), basis: z.enum(["fixed", "per-marla", "per-sqft", "percent"]), amount: z.coerce.number().min(0).max(1e10), due: z.string().trim().max(120).default("") })).max(30),
  plans: z
    .array(
      z.object({
        key: z.string().max(10),
        name: z.string().trim().min(1, "Name every payment plan.").max(80),
        downPaymentPct: pct,
        installments: z.coerce.number().int().min(0).max(240),
        frequency: z.enum(["monthly", "quarterly", "half-yearly"]),
        balloonCount: z.coerce.number().int().min(0).max(40),
        balloonPct: pct,
        possessionPct: pct,
        discountPct: z.coerce.number().min(0).max(50),
        note: z.string().trim().max(200).optional().default(""),
      }),
    )
    .max(20),
})

// Save a draft's changes → { ok } or { error }
export async function savePriceList(code, input) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list) return { error: "That price list was removed." }
  if (list.status !== "draft") return { error: list.status === "pending" ? "It's waiting for approval. Withdraw it to make changes." : "Only drafts can be changed. Start a new version instead." }
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const seen = new Set()
  for (const r of v.rates) {
    const k = `${r.type}|${r.category}|${r.sizeValue ?? "any"}|${r.sizeUnit ?? ""}`
    if (seen.has(k)) return { error: "Two rates are for the same unit type and size. Remove one." }
    seen.add(k)
  }
  await ctx.db("priceLists")
    .where({ id: list.id })
    .update({
      name: v.name,
      effectiveFrom: v.effectiveFrom,
      notes: v.notes || null,
      floorRisePct: v.floorRisePct,
      rates: JSON.stringify(v.rates),
      premiums: JSON.stringify(v.premiums),
      charges: JSON.stringify(v.charges),
      plans: JSON.stringify(v.plans),
      updatedAt: new Date(),
      updatedBy: ctx.user.id,
    })
  return { ok: true }
}

// Activate now (approvers): a draft, or a list someone sent for approval. The project's active
// list is archived; apply re-prices unsold units.
export async function activatePriceList(code, { apply = true } = {}) {
  const { ctx, error } = await estateAction("approve", "price-lists")
  if (error) return { error: "Activating a price list needs approval rights in Estate Management. Send it for approval instead." }
  const list = await listByCode(ctx.db, code)
  if (!list) return { error: "That price list was removed." }
  return activateList(ctx.db, ctx.user.id, list, { apply })
}

// Ask someone with approval rights to activate a draft → { ok } or { error }
export async function submitPriceList(code, { note = "", apply = true } = {}) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list) return { error: "That price list was removed." }
  if (list.status !== "draft") return { error: "Only drafts can be sent for approval." }
  const problem = activationProblem(list)
  if (problem) return { error: problem }
  const project = await ctx.db("projects").where({ id: list.projectId }).first("name", "code")
  await ctx.db("priceLists").where({ id: list.id }).update({ status: "pending", updatedAt: new Date(), updatedBy: ctx.user.id })
  await createApproval(ctx.db, {
    type: "price-list",
    app: "estate",
    subjectType: "price_list",
    subjectId: list.id,
    title: `Activate ${list.name}`,
    details: `${project.name} · v${list.version} · effective ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(list.effectiveFrom))}${apply ? " · re-prices unsold units" : ""}`,
    link: `/estate/price-lists/${list.code.toLowerCase()}`,
    reason: String(note).trim().slice(0, 1000) || null,
    payload: { apply: Boolean(apply) },
    requestedBy: ctx.user.id,
  })
  await logActivity(ctx.db, { type: "estate", action: "price_list.submitted", actorUserId: ctx.user.id, summary: `sent ${list.name} for approval`, subjectType: "project", subjectId: list.projectId })
  return { ok: true }
}

// Take a list back from approval (the person who sent it, or an approver) → draft
export async function withdrawPriceList(code) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list || list.status !== "pending") return { error: "It isn't waiting for approval any more." }
  const request = await pendingFor(ctx.db, "price_list", list.id)
  if (request && request.requestedBy !== ctx.user.id && !ctx.can("approve")) return { error: "Only the person who sent it can withdraw it." }
  await returnToDraft(ctx.db, ctx.user.id, list, { status: "withdrawn" })
  return { ok: true }
}

// Send a list back for changes (approvers), with a note the requester sees
export async function rejectPriceList(code, note) {
  const { ctx, error } = await estateAction("approve", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list || list.status !== "pending") return { error: "It isn't waiting for approval any more." }
  if (!String(note ?? "").trim()) return { error: "Say what needs changing." }
  const request = await pendingFor(ctx.db, "price_list", list.id)
  if (request?.requestedBy === ctx.user.id) return { error: "You asked for this approval, so someone else needs to decide it." }
  await returnToDraft(ctx.db, ctx.user.id, list, { status: "rejected", note: String(note).trim().slice(0, 1000) })
  return { ok: true }
}

// Re-price unsold units under the active list again (e.g. after adding inventory)
export async function applyPriceList(code) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list) return { error: "That price list was removed." }
  if (list.status !== "active") return { error: "Only the active price list can be applied." }
  let repriced = 0
  await ctx.db.transaction(async (trx) => {
    repriced = await applyList(trx, ctx.user.id, list)
  })
  await logActivity(ctx.db, { type: "estate", action: "price_list.applied", actorUserId: ctx.user.id, summary: `re-priced ${repriced} unsold ${repriced === 1 ? "unit" : "units"} under ${list.name}`, subjectType: "project", subjectId: list.projectId })
  return { ok: true, repriced }
}

export async function deletePriceList(code) {
  const { ctx, error } = await estateAction("edit", "price-lists")
  if (error) return { error }
  const list = await listByCode(ctx.db, code)
  if (!list) return { ok: true }
  if (list.status !== "draft") return { error: list.status === "pending" ? "It's waiting for approval. Withdraw it first." : "Only drafts can be deleted. Active and archived lists are kept for the record." }
  await ctx.db("priceLists").where({ id: list.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "estate", action: "price_list.deleted", actorUserId: ctx.user.id, summary: `deleted the draft ${list.name} (${list.code})`, subjectType: "project", subjectId: list.projectId })
  return { ok: true }
}
