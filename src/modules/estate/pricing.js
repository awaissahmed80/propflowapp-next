import { formatPkr } from "@/lib/format"
import { builtin, round1000 } from "./constants"

// Every function takes m: the workspace's measures() (sizes, units, types); without it, the defaults

// Price lists and payment plans, shared by the server (applying a list to inventory) and the
// browser (rates table, calculator, schedules). Sales uses the same plan maths for bookings.

// ---------- rates ----------

// A rate row prices units of one type and category: one size ("5 Marla"), or any size
// (sizeValue null) for series with mixed sizes. A size's own row wins over the any-size row.
export function rateFor(rates, unit) {
  const same = rates.filter((r) => r.type === unit.type && r.category === unit.category)
  return same.find((r) => r.sizeValue != null && Number(r.sizeValue) === Number(unit.sizeValue) && r.sizeUnit === unit.sizeUnit) ?? same.find((r) => r.sizeValue == null) ?? null
}

// "per marla" or "per sq ft", by the unit type
export const rateBasis = (type, m = builtin) => m.rateBasis(type)

// "5 Marla", "Any size"
export const rateSize = (r, m = builtin) => (r.sizeValue == null ? "Any size" : m.formatSize(Number(r.sizeValue), r.sizeUnit))

// "Rs 11.5 Lac/marla", "Rs 32,000/sq ft"
export const rateText = (r, m = builtin) => (rateBasis(r.type, m) === "marla" ? `${formatPkr(r.rate)}/marla` : `Rs ${new Intl.NumberFormat("en-PK").format(r.rate)}/sq ft`)

// Base price of one unit of this row's size (before premiums and floor rise); null for any-size rows
export function ratePrice(r, marlaSqft = 225, m = builtin) {
  if (r.sizeValue == null || !r.rate) return null
  const marla = m.sizeInMarla(Number(r.sizeValue), r.sizeUnit)
  return round1000((marla ?? m.areaSqft(Number(r.sizeValue), r.sizeUnit, marlaSqft)) * Number(r.rate))
}

// "Rs 6.2 – 11.5 Lac/marla · Rs 15,000/sq ft" for list cards
export function rateRange(rates, m = builtin) {
  return ["marla", "sqft"]
    .map((basis) => {
      const values = rates.filter((r) => rateBasis(r.type, m) === basis && r.rate > 0).map((r) => Number(r.rate))
      if (!values.length) return null
      const fmt = basis === "marla" ? (n) => formatPkr(n).replace("Rs ", "") : (n) => new Intl.NumberFormat("en-PK").format(n)
      const [min, max] = [Math.min(...values), Math.max(...values)]
      return `Rs ${min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`}/${basis === "marla" ? "marla" : "sq ft"}`
    })
    .filter(Boolean)
    .join(" · ")
}

// Price of a unit under a list: rate (+ floor rise per floor above ground), then premiums at the
// list's % (or the feature's default % from Lists & Labels when the list doesn't name it).
// featurePremium(feature) → default %. Returns null when no rate row covers the unit.
export function priceUnder(list, unit, { marlaSqft = 225, featurePremium = () => 0, m = builtin } = {}) {
  const row = rateFor(list.rates, unit)
  if (!row || !(row.rate > 0)) return null
  const floorRise = unit.floor > 0 ? Number(list.floorRisePct ?? 0) * unit.floor : 0
  const baseRate = Math.round(Number(row.rate) * (1 + floorRise / 100) * 100) / 100
  const marla = m.sizeInMarla(Number(unit.sizeValue), unit.sizeUnit)
  const basePrice = round1000((marla ?? m.areaSqft(Number(unit.sizeValue), unit.sizeUnit, marlaSqft)) * baseRate)
  const premiums =
    unit.type === "file" ? [] : (unit.features ?? []).map((f) => ({ feature: f, percent: Number(list.premiums.find((p) => p.feature === f)?.percent ?? featurePremium(f) ?? 0) })).filter((p) => p.percent > 0)
  const price = round1000(basePrice * (1 + premiums.reduce((s, p) => s + p.percent, 0) / 100))
  return { baseRate, basePrice, premiums, price, floorRise }
}

const UNSOLD = ["available", "on-hold", "blocked"]

// What applying a list to a project's unsold units would change
export function listImpact(list, units, opts) {
  let before = 0
  let after = 0
  let changed = 0
  const unpriced = new Map()
  const unsold = units.filter((u) => UNSOLD.includes(u.status))
  for (const u of unsold) {
    const next = priceUnder(list, u, opts)
    if (!next) {
      const k = `${u.type}|${(opts?.m ?? builtin).formatSize(Number(u.sizeValue), u.sizeUnit)}|${u.category}`
      unpriced.set(k, (unpriced.get(k) ?? 0) + 1)
      continue
    }
    before += Number(u.price)
    after += next.price
    if (next.price !== Number(u.price)) changed++
  }
  return { unsold: unsold.length, changed, before, after, unpriced: [...unpriced].map(([key, count]) => ({ type: key.split("|")[0], size: key.split("|")[1], category: key.split("|")[2], count })) }
}

// ---------- charges ----------

export const CHARGE_BASES = [
  { value: "fixed", label: "Fixed amount" },
  { value: "per-marla", label: "Per marla" },
  { value: "per-sqft", label: "Per sq ft" },
  { value: "percent", label: "% of price" },
]

// Charge for one unit: per marla, per sq ft, fixed, or % of price
export function chargeAmount(c, { marla, areaSqft, price }) {
  if (c.basis === "per-marla") return marla ? Number(c.amount) * marla : 0
  if (c.basis === "per-sqft") return Number(c.amount) * (areaSqft ?? 0)
  if (c.basis === "percent") return Math.round((price * Number(c.amount)) / 100 / 100) * 100
  return Number(c.amount)
}

// "Rs 85,000 per marla", "2% of price"
export function chargeText(c) {
  const n = new Intl.NumberFormat("en-PK").format(c.amount)
  if (c.basis === "percent") return `${c.amount}% of price`
  if (c.basis === "per-marla") return `Rs ${n} per marla`
  if (c.basis === "per-sqft") return `Rs ${n} per sq ft`
  return `Rs ${n}`
}

// ---------- payment plans ----------
// Down payment, monthly / quarterly / half-yearly installments, balloon payments spread over the
// plan, and an amount due on possession. A plan with 100% down (or no installments) is a cash plan.

export const FREQUENCIES = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "half-yearly", label: "Half-yearly", months: 6 },
]
const MONTHS = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.months]))

export const isCashPlan = (p) => p.downPaymentPct >= 100 || !p.installments
export const planMonths = (p) => (isCashPlan(p) ? 0 : p.installments * MONTHS[p.frequency])
export const installmentPct = (p) => (isCashPlan(p) ? 0 : Math.max(0, 100 - p.downPaymentPct - (p.balloonCount ? p.balloonPct : 0) - p.possessionPct))

export function planProblems(p) {
  const problems = []
  if (!p.name?.trim()) problems.push("Give the plan a name.")
  if (!isCashPlan(p)) {
    if (p.downPaymentPct + (p.balloonCount ? p.balloonPct : 0) + p.possessionPct > 100) problems.push("Down payment, balloon and possession add up to more than 100%.")
    if (p.balloonCount > p.installments) problems.push("More balloon payments than installments.")
    if (p.balloonCount && !p.balloonPct) problems.push("Give the balloon payments a share.")
  }
  return problems
}

// "25% down · 36 monthly · 6 balloon (20%) · 10% on possession"
export function planSummary(p) {
  if (isCashPlan(p)) return p.discountPct ? `Full payment · ${p.discountPct}% discount` : "Full payment"
  const parts = [`${p.downPaymentPct}% down`, `${p.installments} ${p.frequency}`]
  if (p.balloonCount) parts.push(`${p.balloonCount} balloon (${p.balloonPct}%)`)
  if (p.possessionPct) parts.push(`${p.possessionPct}% on possession`)
  return parts.join(" · ")
}

// "3 years", "18 months"
export function planLength(p) {
  const m = planMonths(p)
  return m >= 12 ? `${+(m / 12).toFixed(1)} ${m === 12 ? "year" : "years"}` : `${m} months`
}

const addMonths = (date, n) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}
const round100 = (n) => Math.round(n / 100) * 100

// `total` in `count` equal parts rounded to Rs 100; the last takes the remainder
function split(total, count) {
  if (!count) return []
  const each = round100(total / count)
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - each * (count - 1) : each))
}

// The full schedule for a price → { net, discount, rows: [{ key, label, kind, dueDate, amount, balance }] }
export function paymentSchedule(price, plan, start = new Date()) {
  const startDate = new Date(start)
  startDate.setHours(0, 0, 0, 0)
  let rows
  let net = price
  if (isCashPlan(plan)) {
    net = round100(price * (1 - (plan.discountPct ?? 0) / 100))
    rows = [{ key: "full", label: "Full payment", kind: "down", dueDate: addMonths(startDate, 1), amount: net }]
  } else {
    const step = MONTHS[plan.frequency]
    const down = round100((price * plan.downPaymentPct) / 100)
    const possession = round100((price * plan.possessionPct) / 100)
    const balloonTotal = plan.balloonCount ? round100((price * plan.balloonPct) / 100) : 0
    rows = [{ key: "down", label: "Down payment", kind: "down", dueDate: startDate, amount: down }]
    split(price - down - possession - balloonTotal, plan.installments).forEach((amount, i) =>
      rows.push({ key: `inst-${i + 1}`, label: `Installment ${i + 1} of ${plan.installments}`, kind: "installment", dueDate: addMonths(startDate, (i + 1) * step), amount }),
    )
    if (plan.balloonCount) {
      const every = Math.max(1, Math.round(planMonths(plan) / plan.balloonCount))
      split(balloonTotal, plan.balloonCount).forEach((amount, i) =>
        rows.push({ key: `balloon-${i + 1}`, label: `Balloon payment ${i + 1} of ${plan.balloonCount}`, kind: "balloon", dueDate: addMonths(startDate, (i + 1) * every), amount }),
      )
    }
    if (possession) rows.push({ key: "possession", label: "On possession", kind: "possession", dueDate: addMonths(startDate, planMonths(plan) + step), amount: possession })
    const order = { down: 0, installment: 1, balloon: 2, possession: 3 }
    rows.sort((a, b) => a.dueDate - b.dueDate || order[a.kind] - order[b.kind])
  }
  let balance = net
  rows = rows.map((r, i) => ({ ...r, no: i + 1, balance: (balance -= r.amount) }))
  return { net, discount: price - net, rows }
}

// Plans a new list starts with when there's nothing to copy
export const STARTER_PLANS = [
  { key: "p1", name: "Cash payment", downPaymentPct: 100, installments: 0, frequency: "monthly", balloonCount: 0, balloonPct: 0, possessionPct: 0, discountPct: 5, note: "Full payment within 30 days of booking" },
  { key: "p2", name: "3-year plan", downPaymentPct: 20, installments: 36, frequency: "monthly", balloonCount: 6, balloonPct: 20, possessionPct: 10, discountPct: 0, note: "" },
]

export const NEW_PLAN = { name: "New plan", downPaymentPct: 25, installments: 36, frequency: "monthly", balloonCount: 6, balloonPct: 15, possessionPct: 10, discountPct: 0, note: "" }

export const STARTER_CHARGES = [
  { key: "c1", name: "Development charges", basis: "per-marla", amount: 0, due: "On demand, before possession" },
  { key: "c2", name: "Possession charges", basis: "fixed", amount: 0, due: "At possession" },
]

// Next key for a row in a list part: r1, r2…
export const nextKey = (prefix, rows) => `${prefix}${Math.max(0, ...rows.map((r) => Number(String(r.key).slice(prefix.length)) || 0)) + 1}`

// ---------- quotes ----------

// What a buyer pays for one unit under a list, and when. unit: { type, category, sizeValue,
// sizeUnit, features, floor }. → null when no rate covers it, else
// { price, basePrice, baseRate, premiums, floorRise, plan, schedule, charges, chargesTotal, areaSqft }
export function quote(list, unit, planKey, start, { marlaSqft = 225, featurePremium, m = builtin } = {}) {
  const priced = priceUnder(list, unit, { marlaSqft, featurePremium, m })
  const plan = list.plans.find((p) => p.key === planKey) ?? list.plans[0]
  if (!priced || !plan) return null
  const marla = m.sizeInMarla(Number(unit.sizeValue), unit.sizeUnit)
  const area = m.areaSqft(Number(unit.sizeValue), unit.sizeUnit, marlaSqft)
  const charges = list.charges.map((c) => ({ ...c, total: chargeAmount(c, { marla, areaSqft: area, price: priced.price }) }))
  return { ...priced, plan, areaSqft: area, schedule: paymentSchedule(priced.price, plan, start), charges, chargesTotal: charges.reduce((s, c) => s + c.total, 0) }
}
