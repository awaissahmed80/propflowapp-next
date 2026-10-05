// Dashboard filters, shared by the server (which works out the numbers) and the browser (which
// shows the controls). Everything lives in the URL:
//   ?period=this-month|last-month|this-quarter|this-fy|last-12|custom  (&from=2026-07-01&to=2026-09-30)
//   &project=ske   one project by its code (lowercase), or none for the whole business
//   &compare=0     switch off "vs previous period" (on unless switched off)
//   &tv=1          TV / presentation mode, &rotate=1 to move through the dashboards every minute
// Days are Pakistan days ("yyyy-MM-dd"), whatever the server's time zone.

export const PERIODS = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "this-fy", label: "This financial year" },
  { value: "last-12", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
]
export const DEFAULT_PERIOD = "this-month"

const TZ = "Asia/Karachi"
const DAY = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Today in Pakistan, "2026-10-04"
export const pkDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d))

const parts = (day) => day.split("-").map(Number)
const utc = (day) => Date.UTC(...parts(day).map((n, i) => (i === 1 ? n - 1 : n)))
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day, n) => iso(utc(day) + n * DAY)
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY) + 1
const monthEnd = (y, m) => iso(Date.UTC(y, m, 0)) // m: 1-12
// Same day n months away, kept inside that month (31 Mar − 1 month → 28/29 Feb)
export function addMonths(day, n) {
  const [y, m, d] = parts(day)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = Number(monthEnd(first.getUTCFullYear(), first.getUTCMonth() + 1).slice(8))
  return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)))
}
const startOfMonth = (day) => `${day.slice(0, 7)}-01`
const endOfMonth = (day) => monthEnd(...parts(day).slice(0, 2))
const quarterStart = (day) => {
  const [y, m] = parts(day)
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`
}
// Financial year July–June
const fyStart = (day) => {
  const [y, m] = parts(day)
  return `${m >= 7 ? y : y - 1}-07-01`
}
const valid = (s) => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(utc(s)) && iso(utc(s)) === s

// The instant a Pakistan day starts and ends
export const dayStart = (day) => new Date(`${day}T00:00:00.000+05:00`)
export const dayEnd = (day) => new Date(`${day}T23:59:59.999+05:00`)

const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const long = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
export const formatDay = (day) => long.format(new Date(utc(day)))
export function formatSpan(from, to) {
  if (from === to) return formatDay(from)
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} – ${formatDay(to)}`
  return from.slice(0, 4) === to.slice(0, 4) ? `${short.format(new Date(utc(from)))} – ${formatDay(to)}` : `${formatDay(from)} – ${formatDay(to)}`
}

// The URL's filter values, cleaned → { period, from, to, project, compare, tv, rotate }
export function readFilters(query = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v)
  const period = PERIODS.some((p) => p.value === one(query.period)) ? one(query.period) : DEFAULT_PERIOD
  const from = valid(one(query.from)) ? one(query.from) : null
  const to = valid(one(query.to)) ? one(query.to) : null
  const project = String(one(query.project) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30)
  return {
    period: period === "custom" && !(from && to) ? DEFAULT_PERIOD : period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    project: project || null,
    compare: one(query.compare) !== "0",
    tv: one(query.tv) === "1",
    rotate: one(query.rotate) === "1",
  }
}

// Filter values → "?period=last-month&project=ske" (defaults left out)
export function filterQuery(values, extra = {}) {
  const v = { ...values, ...extra }
  const q = new URLSearchParams()
  if (v.period && v.period !== DEFAULT_PERIOD) q.set("period", v.period)
  if (v.period === "custom" && v.from && v.to) {
    q.set("from", v.from)
    q.set("to", v.to)
  }
  if (v.project) q.set("project", v.project)
  if (v.compare === false) q.set("compare", "0")
  if (v.tv) q.set("tv", "1")
  if (v.tv && v.rotate) q.set("rotate", "1")
  const s = q.toString()
  return s ? `?${s}` : ""
}

// The period as days, to date (never past today), with the one before it to compare with:
//   calendar periods (month, quarter, financial year, last 12 months) compare with the same
//   stretch one period earlier (1–4 Oct with 1–4 Sep); a custom range with the same number of
//   days just before it.
// → { preset, label, from, to, days, partial, prev: { from, to } }
export function resolvePeriod(filters, today = pkDay()) {
  const preset = filters.period
  let from, to, back
  if (preset === "custom") {
    from = filters.from <= filters.to ? filters.from : filters.to
    to = filters.from <= filters.to ? filters.to : filters.from
    // At most three years, ending on the day asked for
    if (daysBetween(from, to) > 1096) from = addDays(to, -1095)
  } else if (preset === "last-month") {
    from = startOfMonth(addMonths(startOfMonth(today), -1))
    to = endOfMonth(from)
    back = 1
  } else if (preset === "this-quarter") {
    from = quarterStart(today)
    to = today
    back = 3
  } else if (preset === "this-fy") {
    from = fyStart(today)
    to = today
    back = 12
  } else if (preset === "last-12") {
    from = startOfMonth(addMonths(today, -11))
    to = today
    back = 12
  } else {
    from = startOfMonth(today)
    to = today
    back = 1
  }
  const days = daysBetween(from, to)
  const prev = back ? { from: addMonths(from, -back), to: addMonths(to, -back) } : { from: addDays(from, -days), to: addDays(from, -1) }
  // A whole last month compares with the whole month before it
  if (preset === "last-month") prev.to = endOfMonth(prev.from)
  const name = PERIODS.find((p) => p.value === preset)?.label
  return {
    preset,
    from,
    to,
    days,
    partial: preset !== "custom" && preset !== "last-month",
    label: preset === "custom" ? formatSpan(from, to) : `${name} · ${formatSpan(from, to)}`,
    span: formatSpan(from, to),
    prev: { ...prev, span: formatSpan(prev.from, prev.to) },
  }
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })

// Trend buckets sized to the range: days up to a month, weeks up to four months, then months
export function bucketsFor({ from, to }) {
  const days = daysBetween(from, to)
  const out = []
  if (days <= 31) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ from: d, to: d, label: dayLabel.format(new Date(utc(d))) })
    return { unit: "day", buckets: out }
  }
  if (days <= 124) {
    for (let d = from; d <= to; d = addDays(d, 7)) {
      const end = addDays(d, 6)
      out.push({ from: d, to: end > to ? to : end, label: dayLabel.format(new Date(utc(d))) })
    }
    return { unit: "week", buckets: out }
  }
  return { unit: "month", buckets: monthsFor({ from, to }, 1) }
}

// Month buckets covering a range, at least `min` months back from its last month
export function monthsFor({ from, to }, min = 6) {
  let start = startOfMonth(from)
  const floor = startOfMonth(addMonths(startOfMonth(to), -(min - 1)))
  if (floor < start) start = floor
  const out = []
  for (let m = start; m <= to && out.length < 40; m = addMonths(m, 1)) {
    const end = endOfMonth(m)
    out.push({ from: m, to: end > to ? to : end, key: m.slice(0, 7), label: monthLabel.format(new Date(utc(m))) })
  }
  return out
}
