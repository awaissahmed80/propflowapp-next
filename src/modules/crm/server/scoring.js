import "server-only"
import { live } from "@/server/db/records"

// Lead score, 0–100, from three parts the workspace weighs in Settings › CRM:
//   Engagement     contacts that reached them in the last N days, worth each activity type's score
//                  points (Lists & Labels), newer ones counting more; outcomes can add or take away
//                  (their "effect on lead score"), missed follow-ups take away.
//   Affordability  their budget against the cheapest available unit that matches what they want
//                  (project, type, size; widened step by step when nothing matches). Unknown
//                  budget counts as a low 40, so it pays to ask.
//   Intent         how far along the pipeline they are, and how much of what they want is known.

const STAGE = { new: 10, contacted: 30, interested: 55, "site-visit": 75, negotiation: 90, booked: 100, lost: 0 }
const PROFILE = [
  ["project", (i) => i.project],
  ["unit type", (i) => i.unitType],
  ["size", (i) => i.sizeValue],
  ["budget", (i) => i.budgetMin || i.budgetMax],
  ["payment plan", (i) => i.paymentPlan],
  ["purpose", (i) => i.purpose],
]
const SIGNAL_POINTS = { positive: 3, negative: -5 }
const MISSED_POINTS = -3
const UNKNOWN_AFFORDABILITY = 40
const DAY = 86_400_000

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)))
const sizeKey = (value, unit) => (value ? `${Number(value)}${unit ?? ""}` : "")

export const GRADES = [
  { min: 75, grade: "A", label: "Strong" },
  { min: 55, grade: "B", label: "Good" },
  { min: 35, grade: "C", label: "Fair" },
  { min: 0, grade: "D", label: "Weak" },
]

// Cheapest available unit for each mix of project / type / size, to compare budgets against
export async function priceIndex(db) {
  const units = await live(db, "units").where({ status: "available" }).select("projectId", "type", "sizeValue", "sizeUnit", "price")
  const index = new Map()
  const put = (key, price) => (!index.has(key) || price < index.get(key)) && index.set(key, price)
  for (const u of units) {
    const price = Number(u.price)
    const size = sizeKey(u.sizeValue, u.sizeUnit)
    put(`${u.projectId}|${u.type}|${size}`, price)
    put(`${u.projectId}|${u.type}|`, price)
    put(`${u.projectId}||`, price)
    put(`|${u.type}|${size}`, price)
    put(`|${u.type}|`, price)
  }
  return index
}

// The closest comparison there is: exact match first, then wider
function referencePrice(index, l) {
  const size = sizeKey(l.sizeValue, l.sizeUnit)
  const tries = [
    l.projectId && l.unitType && size && [`${l.projectId}|${l.unitType}|${size}`, "same project, type and size"],
    l.projectId && l.unitType && [`${l.projectId}|${l.unitType}|`, "same project and type"],
    l.projectId && [`${l.projectId}||`, "same project"],
    l.unitType && size && [`|${l.unitType}|${size}`, "same type and size, any project"],
    l.unitType && [`|${l.unitType}|`, "same type, any project"],
  ].filter(Boolean)
  for (const [key, basis] of tries) if (index.has(key)) return { price: index.get(key), basis }
  return null
}

// Activities that count: done or missed (not system notes, not planned), newest first
export async function scoringActivities(db, leadIds, days) {
  if (!leadIds.length) return new Map()
  const since = new Date(Date.now() - days * DAY)
  const rows = await live(db, "leadActivities")
    .whereIn("leadId", leadIds)
    .whereIn("status", ["done", "missed"])
    .whereNot("type", "system")
    .where((q) => q.where("doneAt", ">=", since).orWhere((w) => w.whereNull("doneAt").where("at", ">=", since)))
    .select("leadId", "type", "status", "outcome", "at", "doneAt")
  const out = new Map()
  for (const r of rows) {
    if (!out.has(r.leadId)) out.set(r.leadId, [])
    out.get(r.leadId).push(r)
  }
  return out
}

// l: the lead row (camelCase), acts: its activities from scoringActivities, lists: activity-type
// and activity-outcome lookups, rules: crmSettings()
export function scoreLead(l, acts = [], { index, lists, rules, now = Date.now() }) {
  const types = new Map(lists["activity-type"].map((t) => [t.value, t]))
  const outcomes = new Map(lists["activity-outcome"].map((o) => [o.value, o]))
  const days = rules.engagementDays

  // Engagement
  let points = 0
  let reached = 0
  let attempts = 0
  let missed = 0
  let positive = 0
  let negative = 0
  for (const a of acts) {
    if (a.status === "missed") {
      missed++
      points += MISSED_POINTS
      continue
    }
    const meta = outcomes.get(a.outcome)?.meta ?? {}
    attempts++
    if (meta.reached === "no") continue // tried, didn't get them: no points
    reached++
    const age = (now - new Date(a.doneAt ?? a.at).getTime()) / DAY
    const fresh = age <= 7 ? 1 : Math.max(0.5, 1 - (0.5 * (age - 7)) / Math.max(1, days - 7))
    const typePoints = Number(types.get(a.type)?.meta?.points)
    points += (Number.isFinite(typePoints) ? typePoints : 2) * fresh
    if (meta.signal === "positive") positive++
    if (meta.signal === "negative") negative++
    points += SIGNAL_POINTS[meta.signal] ?? 0
  }
  const engagement = clamp((points / rules.engagementTarget) * 100)

  // Affordability
  const budget = Number(l.budgetMax || l.budgetMin || 0)
  const ref = referencePrice(index, l)
  let affordability = null
  if (budget && ref) affordability = clamp(((budget / ref.price - 0.5) / 0.5) * 100 + (l.paymentPlan === "cash" ? 10 : 0))

  // Intent
  const interest = { project: l.projectId, unitType: l.unitType, sizeValue: l.sizeValue, budgetMin: l.budgetMin, budgetMax: l.budgetMax, paymentPlan: l.paymentPlan, purpose: l.purpose }
  const missing = PROFILE.filter(([, has]) => !has(interest)).map(([label]) => label)
  const known = PROFILE.length - missing.length
  const intent = clamp(0.7 * (STAGE[l.status] ?? 30) + 0.3 * (known / PROFILE.length) * 100)

  const w = rules.weights
  const total = w.engagement + w.affordability + w.intent || 1
  const value = clamp((engagement * w.engagement + (affordability ?? UNKNOWN_AFFORDABILITY) * w.affordability + intent * w.intent) / total)
  const g = GRADES.find((x) => value >= x.min)
  return {
    value,
    grade: g.grade,
    label: g.label,
    weights: w,
    engagement: { value: engagement, days, contacts: reached, attempts, missed, positive, negative },
    affordability: { value: affordability, budget: budget || null, reference: ref, cash: l.paymentPlan === "cash" },
    intent: { value: intent, known, of: PROFILE.length, missing },
  }
}
