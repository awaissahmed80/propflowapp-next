// Date ranges for dashboards and reports. A range is { preset, from, to } with "yyyy-MM-dd" strings (inclusive).

const pad = (n) => String(n).padStart(2, "0")
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => new Date(`${s}T00:00`)

export const RANGE_PRESETS = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "last-30", label: "Last 30 days" },
  { value: "last-90", label: "Last 90 days" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "custom", label: "Custom range" },
]

export function resolvePreset(preset, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()
  const q = Math.floor(m / 3)
  const range = (from, to) => ({ preset, from: isoDate(from), to: isoDate(to) })
  switch (preset) {
    case "this-month":
      return range(new Date(y, m, 1), new Date(y, m + 1, 0))
    case "last-month":
      return range(new Date(y, m - 1, 1), new Date(y, m, 0))
    case "this-quarter":
      return range(new Date(y, q * 3, 1), new Date(y, q * 3 + 3, 0))
    case "last-quarter":
      return range(new Date(y, q * 3 - 3, 1), new Date(y, q * 3, 0))
    case "last-30":
      return range(new Date(y, m, today.getDate() - 29), today)
    case "last-90":
      return range(new Date(y, m, today.getDate() - 89), today)
    case "last-year":
      return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31))
    case "this-year":
    default:
      return range(new Date(y, 0, 1), new Date(y, 11, 31))
  }
}

export const inRange = (iso, range) => Boolean(iso) && iso.slice(0, 10) >= range.from && iso.slice(0, 10) <= range.to

export function formatRange(range) {
  const f = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const preset = RANGE_PRESETS.find((p) => p.value === range.preset)
  const dates = `${f.format(parse(range.from))} – ${f.format(parse(range.to))}`
  return preset && range.preset !== "custom" ? `${preset.label} (${dates})` : dates
}

// Trend buckets sized to the range: daily ≤ 31 days, weekly ≤ 120 days, otherwise monthly
export function rangeBuckets(range) {
  const start = parse(range.from)
  const end = parse(range.to)
  const days = Math.round((end - start) / 86_400_000) + 1
  const buckets = []
  if (days <= 31) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      buckets.push({ from: isoDate(d), to: isoDate(d), label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d) })
    }
  } else if (days <= 120) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const to = new Date(d)
      to.setDate(to.getDate() + 6)
      buckets.push({
        from: isoDate(d),
        to: isoDate(to > end ? end : to),
        label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d),
      })
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      buckets.push({
        from: isoDate(d < start ? start : d),
        to: isoDate(last > end ? end : last),
        label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(d),
      })
    }
  }
  const unit = days <= 31 ? "day" : days <= 120 ? "week" : "month"
  return { buckets, unit }
}
