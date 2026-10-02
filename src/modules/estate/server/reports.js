import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { toHex } from "@/lib/color"
import { measures } from "../constants"
import { rateBasis, ratePrice, rateSize } from "../pricing"
import { activeListsByProject } from "./price-list-queries"
import { listInventory } from "./queries"

// Estate Management's ready-made reports. Each one describes its columns once and loads plain
// rows; the same result drives the table, chart, print, PDF and Excel (see lib/reports.js).
// load(ctx, { project }) where project is a lowercased project code or "".

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)}`
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0)
const STATUSES = ["available", "on-hold", "booked", "sold", "blocked"]
// Status bar colours as on the inventory board (sold reads as violet, not grey)
const barColor = (color) => (color === "gray" ? "#a78bfa" : (toHex(color) ?? "#94a3b8"))

// Inventory and labels for a report, narrowed to one project when picked
async function inventory(ctx, project) {
  const [units, lists] = await Promise.all([listInventory(ctx), getLookups(ctx.db, ["unit-status", "unit-type", "feature", "hold-reason", "area-unit", "block-category"])])
  const label = (key) => (v) => lists[key].find((x) => x.value === v)?.label ?? v
  return {
    units: project ? units.filter((u) => u.project?.code.toLowerCase() === project) : units,
    status: label("unit-status"),
    type: label("unit-type"),
    feature: label("feature"),
    reason: label("hold-reason"),
    m: measures(lists),
    statusColors: Object.fromEntries(lists["unit-status"].map((s) => [s.value, barColor(s.color)])),
  }
}

function countByStatus(units) {
  const c = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1
  return c
}

export const REPORT_GROUPS = ["Inventory", "Sales & dealers"]

export const REPORTS = [
  {
    id: "availability",
    group: "Inventory",
    title: "Availability by block",
    description: "Units per block by status, with available stock value and sell-through.",
    icon: "layout-grid-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const inv = await inventory(ctx, project)
      const map = new Map()
      for (const u of inv.units) {
        const k = u.block?.id ?? "none"
        if (!map.has(k)) map.set(k, { id: String(k), project: u.project?.name, phase: u.phase?.name, block: u.block?.name ?? "—", units: [] })
        map.get(k).units.push(u)
      }
      const rows = [...map.values()].map(({ units, ...r }) => {
        const c = countByStatus(units)
        return {
          ...r,
          total: units.length,
          ...c,
          soldPct: pct(c.booked + c.sold, units.length),
          availableValue: sum(
            units.filter((u) => u.status === "available"),
            (u) => u.price,
          ),
        }
      })
      const c = countByStatus(inv.units)
      return {
        columns: [
          { key: "project", header: "Project", width: 22 },
          { key: "phase", header: "Phase", width: 12 },
          { key: "block", header: "Block", width: 16 },
          { key: "total", header: "Units", type: "number", width: 8 },
          ...STATUSES.map((s) => ({ key: s, header: inv.status(s), type: "number", width: 9 })),
          { key: "soldPct", header: "Booked / sold", type: "pct", width: 12 },
          { key: "availableValue", header: "Available stock", type: "pkr", width: 18 },
        ],
        rows,
        summary: [
          { label: "Units", value: number(inv.units.length) },
          { label: "Available", value: number(c.available) },
          { label: "Booked or sold", value: `${pct(c.booked + c.sold, inv.units.length)}%` },
          {
            label: "Available stock",
            value: rs(
              sum(
                inv.units.filter((u) => u.status === "available"),
                (u) => u.price,
              ),
            ),
          },
        ],
        chart: rows.length
          ? {
              kind: "stacked",
              title: "Units by status",
              categoryKey: "label",
              series: STATUSES.map((s) => ({ key: s, label: inv.status(s), color: inv.statusColors[s] ?? "#94a3b8" })),
              data: rows.map((r) => ({ label: project ? r.block : `${r.block} · ${r.project}`, ...Object.fromEntries(STATUSES.map((s) => [s, r[s]])) })),
            }
          : null,
      }
    },
  },
  {
    id: "stock-by-size",
    group: "Inventory",
    title: "Stock by size & type",
    description: "How much of each plot size and unit type is left, and its price range.",
    icon: "ruler-2-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const inv = await inventory(ctx, project)
      const map = new Map()
      for (const u of inv.units) {
        const size = inv.m.formatSize(u.sizeValue, u.sizeUnit)
        const k = `${u.type}|${size}`
        if (!map.has(k)) map.set(k, { id: k, typeKey: u.type, type: inv.type(u.type), size, rank: inv.m.sizeInMarla(u.sizeValue, u.sizeUnit) ?? 10_000 + u.sizeValue, units: [] })
        map.get(k).units.push(u)
      }
      const rows = [...map.values()]
        .map(({ units, ...r }) => {
          const c = countByStatus(units)
          const prices = units.map((u) => u.price)
          return {
            ...r,
            total: units.length,
            available: c.available,
            hold: c["on-hold"],
            committed: c.booked + c.sold,
            min: Math.min(...prices),
            max: Math.max(...prices),
            availableValue: sum(
              units.filter((u) => u.status === "available"),
              (u) => u.price,
            ),
          }
        })
        .sort((a, b) => a.typeKey.localeCompare(b.typeKey) || a.rank - b.rank)
      return {
        columns: [
          { key: "type", header: "Type", width: 12 },
          { key: "size", header: "Size", width: 12 },
          { key: "total", header: "Units", type: "number", width: 8 },
          { key: "available", header: inv.status("available"), type: "number", width: 10 },
          { key: "hold", header: inv.status("on-hold"), type: "number", width: 10 },
          { key: "committed", header: "Booked / sold", type: "number", width: 12 },
          { key: "min", header: "From", type: "pkr", width: 14 },
          { key: "max", header: "To", type: "pkr", width: 14 },
          { key: "availableValue", header: "Available stock", type: "pkr", width: 18 },
        ],
        rows,
        summary: [
          { label: "Sizes", value: number(rows.length) },
          { label: "Available units", value: number(sum(rows, (r) => r.available)) },
          { label: "Available stock", value: rs(sum(rows, (r) => r.availableValue)) },
        ],
        chart: rows.length
          ? {
              kind: "bar",
              title: "Available units",
              categoryKey: "label",
              valueKey: "available",
              valueLabel: "Available units",
              data: rows.map((r) => ({ label: `${r.size} ${r.type.toLowerCase()}`, available: r.available })),
            }
          : null,
      }
    },
  },
  {
    id: "premium-units",
    group: "Inventory",
    title: "Premium locations",
    description: "Corner, park facing, boulevard and other premium units, and the premium they carry.",
    icon: "star-smile-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const inv = await inventory(ctx, project)
      const map = new Map()
      for (const u of inv.units)
        for (const p of u.premiums) {
          if (!map.has(p.feature)) map.set(p.feature, { id: p.feature, feature: inv.feature(p.feature), units: 0, available: 0, percents: [], premiumValue: 0 })
          const r = map.get(p.feature)
          r.units++
          r.percents.push(Number(p.percent))
          if (u.status === "available") {
            r.available++
            r.premiumValue += Math.round((u.basePrice * Number(p.percent)) / 100)
          }
        }
      const rows = [...map.values()].map(({ percents, ...r }) => ({ ...r, percent: Math.round((sum(percents, (x) => x) / percents.length) * 10) / 10 })).sort((a, b) => b.units - a.units)
      return {
        columns: [
          { key: "feature", header: "Feature", width: 20 },
          { key: "units", header: "Units", type: "number", width: 8 },
          { key: "available", header: "Available", type: "number", width: 10 },
          { key: "percent", header: "Premium", type: "pct", width: 10 },
          { key: "premiumValue", header: "Premium on available stock", type: "pkr", width: 24 },
        ],
        rows,
        summary: [
          { label: "Premium units", value: number(sum(rows, (r) => r.units)) },
          { label: "Available", value: number(sum(rows, (r) => r.available)) },
          { label: "Premium on available stock", value: rs(sum(rows, (r) => r.premiumValue)) },
        ],
        chart: rows.length ? { kind: "bar", title: "Premium units", categoryKey: "feature", valueKey: "units", valueLabel: "Units", data: rows } : null,
      }
    },
  },
  {
    id: "holds",
    group: "Inventory",
    title: "Token holds register",
    description: "Every unit on hold, who holds it, why, and when the hold lapses.",
    icon: "lock-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const inv = await inventory(ctx, project)
      const now = Date.now()
      const left = (at) => {
        const ms = new Date(at).getTime() - now
        if (ms <= 0) return "Lapsed"
        const h = Math.floor(ms / 3_600_000)
        return h < 1 ? "Under 1h" : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`
      }
      const rows = inv.units
        .filter((u) => u.status === "on-hold" && u.hold)
        .sort((a, b) => new Date(a.hold.expiresAt) - new Date(b.hold.expiresAt))
        .map((u) => ({
          id: u.code,
          unit: `${inv.type(u.type)} ${u.number}`,
          project: u.project?.name,
          block: u.block?.name,
          heldBy: u.hold.by ?? "—",
          reason: inv.reason(u.hold.reason),
          expires: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date(u.hold.expiresAt)),
          left: left(u.hold.expiresAt),
          price: u.price,
        }))
      return {
        columns: [
          { key: "unit", header: "Unit", width: 16 },
          { key: "project", header: "Project", width: 20 },
          { key: "block", header: "Block", width: 14 },
          { key: "heldBy", header: "Held by", width: 16 },
          { key: "reason", header: "Reason", width: 22 },
          { key: "expires", header: "Expires", width: 18 },
          { key: "left", header: "Time left", width: 10 },
          { key: "price", header: "Price", type: "pkr", width: 14 },
        ],
        rows,
        summary: [
          { label: "Units on hold", value: number(rows.length) },
          { label: "Ending within 24h", value: number(rows.filter((r) => !r.left.includes("d")).length) },
          { label: "Value held", value: rs(sum(rows, (r) => r.price)) },
        ],
      }
    },
  },
  {
    id: "dealer-quotas",
    group: "Sales & dealers",
    title: "Dealer quotas",
    description: "Files and plots allocated to each dealer, and how much of it is still unsold.",
    icon: "shake-hands-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const [inv, dealers] = await Promise.all([inventory(ctx, project), live(ctx.db, "dealers").orderBy("name").select("code", "name", "city")])
      const rows = dealers.map((d) => {
        const mine = inv.units.filter((u) => u.dealer?.code === d.code)
        return {
          id: d.code,
          dealer: d.name,
          city: d.city ?? "—",
          allocated: mine.length,
          available: mine.filter((u) => u.status === "available").length,
          hold: mine.filter((u) => u.status === "on-hold").length,
          sold: mine.filter((u) => ["booked", "sold"].includes(u.status)).length,
          value: sum(mine, (u) => u.price),
        }
      })
      return {
        columns: [
          { key: "dealer", header: "Dealer", width: 24 },
          { key: "city", header: "City", width: 12 },
          { key: "allocated", header: "Allocated", type: "number", width: 10 },
          { key: "available", header: inv.status("available"), type: "number", width: 10 },
          { key: "hold", header: inv.status("on-hold"), type: "number", width: 10 },
          { key: "sold", header: "Booked / sold", type: "number", width: 12 },
          { key: "value", header: "Quota value", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Dealers", value: number(rows.length) },
          { label: "Units in quotas", value: number(sum(rows, (r) => r.allocated)) },
          { label: "Quota value", value: rs(sum(rows, (r) => r.value)) },
        ],
        chart: rows.some((r) => r.allocated) ? { kind: "bar", title: "Units allocated", categoryKey: "dealer", valueKey: "allocated", valueLabel: "Units allocated", data: rows } : null,
        note: rows.length ? null : "No dealer firms yet. Add them in Users & Teams › Dealer Accounts.",
      }
    },
  },
  {
    id: "price-list-rates",
    group: "Sales & dealers",
    title: "Current rates",
    description: "Base rates from each project's active price list.",
    icon: "price-tag-3-line",
    filters: ["project"],
    async load(ctx, { project }) {
      const [lists, projects, labels] = await Promise.all([
        activeListsByProject(ctx),
        live(ctx.db, "projects").orderBy("name").select("code", "name", "marlaSqft"),
        getLookups(ctx.db, ["unit-type", "block-category", "area-unit"]),
      ])
      const label = (key, v) => labels[key].find((x) => x.value === v)?.label ?? v
      const m = measures(labels)
      const shown = projects.filter((p) => lists[p.code] && (!project || p.code.toLowerCase() === project))
      const rows = shown.flatMap((p) => {
        const l = lists[p.code]
        return l.rates
          .filter((r) => r.rate > 0)
          .map((r) => ({
            id: `${l.code}-${r.key}`,
            project: p.name,
            list: `${l.name} (v${l.version})`,
            unit: `${label("unit-type", r.type)} · ${rateSize(r, m)}`,
            category: label("block-category", r.category),
            rate: `Rs ${number(r.rate)}/${rateBasis(r.type, m) === "marla" ? "marla" : "sq ft"}`,
            price: ratePrice(r, Number(p.marlaSqft), m),
            effective: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(l.effectiveFrom)),
          }))
      })
      return {
        columns: [
          { key: "project", header: "Project", width: 20 },
          { key: "list", header: "Price list", width: 26 },
          { key: "unit", header: "Unit", width: 18 },
          { key: "category", header: "Category", width: 12 },
          { key: "rate", header: "Base rate", width: 18 },
          { key: "price", header: "Price per unit", type: "pkr", width: 16 },
          { key: "effective", header: "Effective from", width: 14 },
        ],
        rows,
        summary: [
          { label: "Active price lists", value: number(shown.length) },
          { label: "Rates", value: number(rows.length) },
        ],
        note: rows.length ? null : "No active price lists yet. Create and activate one in Price Lists.",
      }
    },
  },
]

export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null

// What the browser needs to list reports (no functions)
export const reportMeta = (r) => ({ id: r.id, group: r.group, title: r.title, description: r.description, icon: r.icon, filters: r.filters ?? [] })

// Filter choices: projects by their lowercased code
export async function reportFilters(ctx) {
  const projects = await live(ctx.db, "projects").orderBy("name").select("code", "name")
  return { project: { label: "Project", all: "All projects", options: projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name })) } }
}

// Run a report for filter values from the URL → { columns, rows, summary, chart, note, scope }
export async function runReport(ctx, report, query, filters) {
  const values = Object.fromEntries((report.filters ?? []).map((k) => [k, String(query?.[k] ?? "").toLowerCase()]))
  const result = await report.load(ctx, values)
  const scope = (report.filters ?? [])
    .map((k) => filters[k]?.options.find((o) => o.value === values[k])?.label ?? filters[k]?.all)
    .filter(Boolean)
    .join(" · ")
  return { ...result, values, scope }
}
