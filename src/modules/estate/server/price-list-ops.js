import "server-only"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { getLookups } from "@/modules/lookups/server"
import { closeApproval, pendingFor } from "@/modules/approvals/server/requests"
import { measures } from "../constants"
import { planProblems, priceUnder } from "../pricing"
import { shapeList } from "./price-list-queries"

// Price list steps shared by Estate's own actions and the approvals inbox (My Desk).
// db: the workspace database; userId: who is acting.

const UNSOLD = ["available", "on-hold", "blocked"]

export const listByCode = (db, code) =>
  live(db, "priceLists")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()

// Why a list can't be activated yet, or null
export function activationProblem(listRow) {
  const s = shapeList(listRow)
  if (!s.rates.some((r) => r.rate > 0)) return "Add at least one rate before activating."
  if (s.rates.some((r) => !(r.rate > 0))) return "Every rate needs an amount. Fill them in or remove the empty ones."
  const bad = s.plans.find((p) => planProblems(p).length)
  return bad ? `${bad.name || "A plan"}: ${planProblems(bad)[0]}` : null
}

// Re-price a project's unsold units under a list → number changed
export async function applyList(trx, userId, listRow) {
  const list = shapeList(listRow)
  const [project, units, lists] = await Promise.all([
    trx("projects").where({ id: listRow.projectId }).first("marlaSqft"),
    live(trx, "units").where({ projectId: listRow.projectId }).whereIn("status", UNSOLD).select("id", "type", "category", "sizeValue", "sizeUnit", "areaSqft", "floor", "features", "price", "baseRate"),
    getLookups(trx, ["feature", "area-unit", "unit-type", "block-category"]),
  ])
  const featurePremium = (f) => Number(lists.feature.find((x) => x.value === f)?.meta?.premium ?? 0)
  const opts = { marlaSqft: Number(project.marlaSqft), featurePremium, m: measures(lists) }
  let changed = 0
  const now = new Date()
  for (const u of units) {
    const next = priceUnder(list, { ...u, sizeValue: Number(u.sizeValue), features: u.features ?? [] }, opts)
    if (!next || (next.price === Number(u.price) && next.baseRate === Number(u.baseRate))) continue
    await trx("units")
      .where({ id: u.id })
      .update({ baseRate: next.baseRate, basePrice: next.basePrice, premiums: JSON.stringify(next.premiums), price: next.price, updatedAt: now, updatedBy: userId })
    changed++
  }
  return changed
}

// Draft or awaiting approval → active. The project's active list is archived, an open request is
// marked approved, and unsold units are re-priced when apply is on. → { repriced } or { error }
export async function activateList(db, userId, listRow, { apply = true } = {}) {
  if (!["draft", "pending"].includes(listRow.status)) return { error: "Only drafts can be activated." }
  const problem = activationProblem(listRow)
  if (problem) return { error: problem }
  const request = await pendingFor(db, "price_list", listRow.id)
  if (request && request.requestedBy === userId) return { error: "You asked for this approval, so someone else needs to decide it." }
  let repriced = 0
  await db.transaction(async (trx) => {
    await live(trx, "priceLists").where({ projectId: listRow.projectId, status: "active" }).update({ status: "archived", updatedAt: new Date(), updatedBy: userId })
    await trx("priceLists").where({ id: listRow.id }).update({ status: "active", activatedBy: userId, activatedAt: new Date(), updatedAt: new Date(), updatedBy: userId })
    if (request) await closeApproval(trx, request.id, { status: "approved", userId })
    if (apply) repriced = await applyList(trx, userId, listRow)
  })
  const project = await db("projects").where({ id: listRow.projectId }).first("name")
  await logActivity(db, {
    type: "estate",
    action: "price_list.activated",
    actorUserId: userId,
    summary: `activated ${listRow.name} (v${listRow.version}) for ${project.name}${apply ? `, re-pricing ${repriced} unsold ${repriced === 1 ? "unit" : "units"}` : ""}`,
    subjectType: "project",
    subjectId: listRow.projectId,
  })
  return { repriced }
}

// Awaiting approval → draft again: rejected (with a note for the requester) or withdrawn
export async function returnToDraft(db, userId, listRow, { status, note = null }) {
  const request = await pendingFor(db, "price_list", listRow.id)
  await db.transaction(async (trx) => {
    await trx("priceLists").where({ id: listRow.id, status: "pending" }).update({ status: "draft", updatedAt: new Date(), updatedBy: userId })
    if (request) await closeApproval(trx, request.id, { status, userId, note })
  })
  await logActivity(db, {
    type: "estate",
    action: status === "rejected" ? "price_list.rejected" : "price_list.withdrawn",
    actorUserId: userId,
    summary: status === "rejected" ? `sent ${listRow.name} back for changes${note ? `: ${note}` : ""}` : `withdrew ${listRow.name} from approval`,
    subjectType: "project",
    subjectId: listRow.projectId,
  })
}
