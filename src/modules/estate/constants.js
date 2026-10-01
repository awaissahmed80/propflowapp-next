// Estate helpers used on the server and in the browser: sizes in marla / kanal / sq ft, standard
// plot dimensions, prices with premiums, and labels.

export const PROJECT_COLORS = ["#0270d2", "#7a4dd8", "#0f9d74", "#d9822b", "#1528a0", "#c2410c", "#0e7490", "#be185d"]

export const KANAL_MARLA = 20 // 1 kanal = 20 marla

// ---------- measures ----------
// How units are sized and where they fit come from three Lists & Labels lists the workspace can
// change: Area units (each counted in marla for land, or sq ft for floor area), Unit types (sized
// by land or floor area; fit residential, commercial, both, or unballoted files) and Block
// categories (hold residential, commercial or both). measures(lists) builds the rules from them;
// without lists it uses the values PropFlow comes with (the plain exports below).

const BUILTIN_UNITS = {
  marla: { measures: "land", size: 1, short: "Marla" },
  kanal: { measures: "land", size: 20, short: "Kanal" },
  acre: { measures: "land", size: 160, short: "Acre" },
  sqft: { measures: "floor", size: 1, short: "sq ft" },
  sqyd: { measures: "floor", size: 9, short: "sq yd" },
  sqm: { measures: "floor", size: 10.7639, short: "m²" },
}
const BUILTIN_TYPES = {
  plot: { measures: "land", fits: "both" },
  file: { measures: "land", fits: "files" },
  house: { measures: "land", fits: "residential" },
  farmhouse: { measures: "land", fits: "residential" },
  apartment: { measures: "floor", fits: "residential" },
  shop: { measures: "floor", fits: "commercial" },
  office: { measures: "floor", fits: "commercial" },
}
const BUILTIN_CATEGORIES = { residential: { holds: "residential" }, commercial: { holds: "commercial" } }

const defsFrom = (values, builtin, pick) => {
  if (!values?.length) return { order: Object.keys(builtin), active: new Set(Object.keys(builtin)), def: builtin }
  const def = { ...builtin }
  for (const v of values) def[v.value] = { ...(builtin[v.value] ?? {}), ...pick(v) }
  return { order: values.map((v) => v.value), active: new Set(values.filter((v) => v.isActive !== false && v.active !== false).map((v) => v.value)), def }
}

// lists: { "area-unit": [...], "unit-type": [...], "block-category": [...] } as lookups give them
export function measures(lists = {}) {
  const units = defsFrom(lists["area-unit"], BUILTIN_UNITS, (v) => ({ measures: v.meta?.measures ?? BUILTIN_UNITS[v.value]?.measures ?? "floor", size: Number(v.meta?.size) || BUILTIN_UNITS[v.value]?.size || 1, short: v.meta?.short || v.label }))
  const types = defsFrom(lists["unit-type"], BUILTIN_TYPES, (v) => ({ measures: v.meta?.measures ?? BUILTIN_TYPES[v.value]?.measures ?? "land", fits: v.meta?.fits ?? BUILTIN_TYPES[v.value]?.fits ?? "both" }))
  const cats = defsFrom(lists["block-category"], BUILTIN_CATEGORIES, (v) => ({ holds: v.meta?.holds ?? BUILTIN_CATEGORIES[v.value]?.holds ?? "both" }))
  const unit = (u) => units.def[u] ?? { measures: "floor", size: 1, short: u ?? "" }

  const sizedInSqft = (type) => (types.def[type]?.measures ?? "land") === "floor"
  // Units a type can be sized in (switched-off units are left out, unless nothing else is left)
  const unitsFor = (type) => {
    const want = sizedInSqft(type) ? "floor" : "land"
    const all = units.order.filter((u) => unit(u).measures === want)
    const on = all.filter((u) => units.active.has(u))
    return on.length ? on : all
  }
  // Unit types a block can hold: by its category, or files only in an unballoted phase
  const typesFor = (category, { unballoted = false } = {}) => {
    const on = types.order.filter((t) => types.active.has(t))
    if (unballoted) return on.filter((t) => types.def[t]?.fits === "files")
    const holds = cats.def[category]?.holds ?? "both"
    return on.filter((t) => {
      const fits = types.def[t]?.fits ?? "both"
      if (fits === "files") return false
      return holds === "both" || fits === "both" || fits === holds
    })
  }
  // Land sizes in marla (null for floor-area units)
  const sizeInMarla = (value, u) => (unit(u).measures === "land" ? Number(value) * unit(u).size : null)
  const areaSqft = (value, u, marlaSqft) => {
    const marla = sizeInMarla(value, u)
    return Math.round(marla == null ? Number(value) * unit(u).size : marla * Number(marlaSqft))
  }
  // "5 Marla", "1 Kanal", "650 sq ft", "120 sq yd"
  const formatSize = (value, u) => {
    const n = Number(value)
    const num = Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, "")
    return `${unit(u).measures === "floor" ? new Intl.NumberFormat("en-PK").format(num) : num} ${unit(u).short}`
  }
  const allUnits = units.order
  return { sizedInSqft, unitsFor, typesFor, sizeInMarla, areaSqft, formatSize, unitShort: (u) => unit(u).short, allUnits, rateBasis: (type) => (sizedInSqft(type) ? "sqft" : "marla") }
}

// The values PropFlow comes with, for code that has no lists at hand
export const builtin = measures()
export const { sizedInSqft, unitsFor, typesFor, sizeInMarla, areaSqft, formatSize } = builtin
// Any unit a size may be stored in (custom units included): server checks use the workspace's list
export const AREA_UNITS = Object.keys(BUILTIN_UNITS)
export const LAND_UNITS = ["marla", "kanal", "acre"]
export const FLOOR_UNITS = ["sqft", "sqyd", "sqm"]
export const SQFT_TYPES = ["apartment", "shop", "office"]
export const TYPES_FOR = { residential: typesFor("residential"), commercial: typesFor("commercial"), unballoted: typesFor(null, { unballoted: true }) }

// Common plot dimensions (feet) by marla size
const STANDARD_DIMENSIONS = {
  225: { 3: "18×37", 4: "20×45", 5: "25×45", 7: "30×52", 8: "30×60", 10: "35×65", 20: "50×90", 40: "75×120" },
  272.25: { 3: "20×41", 4: "25×44", 5: "30×45", 7: "35×55", 8: "35×62", 10: "40×68", 20: "55×99", 40: "80×136" },
}
export const standardDimensions = (marlaSqft, value, unit) => STANDARD_DIMENSIONS[Number(marlaSqft)]?.[sizeInMarla(value, unit)] ?? null

export const round1000 = (n) => Math.round(Number(n) / 1000) * 1000

// Base price from a rate per marla (or per sq ft), then premiums on top, rounded to Rs 1,000
export function priceFor({ rate, value, unit, marlaSqft, premiums = [], m = builtin }) {
  const marla = m.sizeInMarla(value, unit)
  const base = round1000((marla ?? m.areaSqft(value, unit, marlaSqft)) * Number(rate))
  const pct = premiums.reduce((s, p) => s + Number(p.percent || 0), 0)
  return { base, price: round1000(base * (1 + pct / 100)) }
}

// "Plot 12", "File SKE-F-1001"
export const unitLabel = (typeLabel, number) => `${typeLabel} ${number}`

// "Block A · Street 2 · Floor 4"
export function unitPlace(u) {
  return [u.block?.name, u.street, u.floor != null && u.floor > 0 && u.type !== "shop" ? `Floor ${u.floor}` : null].filter(Boolean).join(" · ")
}

// Kanal / marla for a project's total area
export const formatArea = (value, unit) => `${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(value)} ${builtin.unitShort(unit)}`

// Unit counts per status → totals for availability bars
export function summarize(units) {
  const counts = { available: 0, "on-hold": 0, booked: 0, sold: 0, blocked: 0 }
  let totalValue = 0
  let availableValue = 0
  for (const u of units) {
    counts[u.status] = (counts[u.status] ?? 0) + 1
    totalValue += Number(u.price)
    if (u.status === "available") availableValue += Number(u.price)
  }
  const total = units.length
  return { counts, total, totalValue, availableValue, soldPct: total ? Math.round(((counts.booked + counts.sold) / total) * 100) : 0 }
}
