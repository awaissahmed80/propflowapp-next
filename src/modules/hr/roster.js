// Duty roster rules shared by the server and the browser (no database here).
//
// Posts (a gate, the site office, transport…) have shifts that need a number of people on some
// weekdays. Each rostered employee has regular duties (patterns): a post and shift on certain
// weekdays, optionally swapping day and night every other week (guards) or only in odd / even
// weeks (weekend duty). One-day overrides take someone off a shift or add cover; approved leave
// takes people off without an override. Dates are "YYYY-MM-DD" keys, worked out in UTC so they
// never shift with the server's or browser's time zone.
//
//   posts:     [{ id, code, name, kind, projectId, shifts: [{ key, label, start, end, needed, days? }] }]
//   patterns:  [{ employeeId, postId, shiftKey, days: [0-6], rotate, weeks: odd | even | null }]
//   overrides: [{ date, employeeId, postId, shiftKey, kind: add | remove }]
//   leave:     [{ employeeId, startOn, endOn, type }] (approved only)

const DAY = 86_400_000
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
// Office staff without duties work Monday to Saturday
export const OFFICE_DAYS = [1, 2, 3, 4, 5, 6]
// Monday first, as the roster reads
export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
]
export const MARKS = ["present", "late", "absent"]

// ---------- dates ----------

const ms = (key) => {
  const [y, m, d] = String(key).slice(0, 10).split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}
// A DATE column (Date at UTC midnight) or a string → "2026-10-05"
export const dayKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10))
export const isDayKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? "")) && dayKey(new Date(ms(s))) === s
// Today in Pakistan
export const todayKey = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now)
export const addDays = (key, n) => dayKey(new Date(ms(key) + n * DAY))
export const weekdayOf = (key) => new Date(ms(key)).getUTCDay()
// Monday of the week a day falls in
export const weekStart = (key) => addDays(key, -((weekdayOf(key) + 6) % 7))
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i))
// Weeks are counted from Monday 1 Jan 2024 (ISO week 1), so odd / even never jumps at a new year.
// It matches ISO week numbers until the first 53-week year after that (2026).
const REFERENCE = Date.UTC(2024, 0, 1)
export const weekIndex = (key) => Math.floor((ms(weekStart(key)) - REFERENCE) / (7 * DAY))
export const oddWeek = (key) => ((weekIndex(key) % 2) + 2) % 2 === 1

// ISO week number, for labels ("Week 41")
export function isoWeek(key) {
  const d = new Date(ms(key))
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY)
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - jan1) / DAY / 7) + 1
}

const fmt = (key, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(ms(key)))
export const dayLabel = (key, opts = { weekday: "short", day: "numeric" }) => fmt(key, opts)
export const longDay = (key) => fmt(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
// "5 – 11 Oct 2026"
export function weekLabel(start) {
  const end = addDays(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return `${fmt(start, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`
}

// ---------- shifts and patterns ----------

export const shiftRuns = (shift, key) => (shift.days?.length ? shift.days : ALL_DAYS).includes(weekdayOf(key))
// "08:00 – 20:00"
export const shiftTime = (s) => `${s.start} – ${s.end}`
export const overnight = (s) => s.end <= s.start
export const shiftIcon = (s) => (s.key === "night" || (overnight(s) && s.start >= "16:00") ? "moon-line" : s.start < "12:00" ? "sun-line" : "time-line")

// "Mon–Sat", "Sat, Sun", "Every day"
export function daysText(days = ALL_DAYS) {
  const set = new Set(days)
  if (set.size === 7) return "Every day"
  if (!set.size) return "No days"
  const order = WEEKDAYS.filter((d) => set.has(d.value))
  const idx = order.map((d) => WEEKDAYS.indexOf(d))
  const run = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  return run ? `${order[0].short}–${order.at(-1).short}` : order.map((d) => d.short).join(", ")
}

const SWAP = { day: "night", night: "day" }

// The shift a regular duty puts someone on for a day, or null when it doesn't apply.
// post: to check a swapped shift exists (a post without a night shift never swaps)
export function patternShift(p, key, post = null) {
  if (!p.days?.includes(weekdayOf(key))) return null
  const odd = oddWeek(key)
  if (p.weeks && (p.weeks === "odd") !== odd) return null
  if (!p.rotate || !odd || !SWAP[p.shiftKey]) return p.shiftKey
  const swapped = SWAP[p.shiftKey]
  return !post || post.shifts.some((s) => s.key === swapped) ? swapped : p.shiftKey
}

// Who is on each post and shift for a day: Map "postId:shiftKey" → [{ employeeId, cover }]
// (patterns, then the day's overrides; shifts that don't run that day are left out)
export function assignments({ posts, patterns, overrides = [] }, key) {
  const byId = new Map(posts.map((p) => [p.id, p]))
  const out = new Map()
  const runs = (postId, shiftKey) => {
    const s = byId.get(postId)?.shifts.find((x) => x.key === shiftKey)
    return s && shiftRuns(s, key)
  }
  const add = (postId, shiftKey, employeeId, cover) => {
    if (!runs(postId, shiftKey)) return
    const k = `${postId}:${shiftKey}`
    const list = out.get(k) ?? []
    if (!list.some((x) => x.employeeId === employeeId)) out.set(k, [...list, { employeeId, cover }])
  }
  for (const p of patterns) {
    const post = byId.get(p.postId)
    if (!post) continue
    const shiftKey = patternShift(p, key, post)
    if (shiftKey) add(p.postId, shiftKey, p.employeeId, false)
  }
  for (const o of overrides) {
    if (o.date !== key) continue
    const k = `${o.postId}:${o.shiftKey}`
    if (o.kind === "add") add(o.postId, o.shiftKey, o.employeeId, true)
    else if (out.has(k))
      out.set(
        k,
        out.get(k).filter((x) => x.employeeId !== o.employeeId),
      )
  }
  return out
}

// Full-time on the roster: regular duties on four or more weekdays (guards, site staff). Anyone
// else (no duties, or only weekend duty at the sales office) is office staff Monday to Saturday
// on the days they have no duty.
export const fullTimeRoster = (patterns, employeeId) => new Set(patterns.filter((p) => p.employeeId === employeeId).flatMap((p) => p.days ?? [])).size >= 4

// Expected at the office that day: office staff on an office day
export const officeDay = (patterns, employeeId, key) => OFFICE_DAYS.includes(weekdayOf(key)) && !fullTimeRoster(patterns, employeeId)

// The approved leave someone is on that day, or null
export const leaveOn = (leave, employeeId, key) => leave.find((l) => l.employeeId === employeeId && dayKey(l.startOn) <= key && dayKey(l.endOn) >= key) ?? null

// How someone on a shift stands that day: leave | present | late | absent | unmarked (past or
// today, nothing marked) | on (a future day)
export function dutyStatus({ leave, mark, date, today }) {
  if (leave) return "leave"
  if (mark) return mark
  return date <= today ? "unmarked" : "on"
}

// People short on a shift: needed minus those not on leave or absent
export const shortBy = (needed, people) => Math.max(0, Number(needed) - people.filter((p) => !["leave", "absent"].includes(p.status)).length)

// Warnings before putting someone on a shift for a day (they can still be added):
//   data: { posts, patterns, overrides, leave } · employeeId / postId / shiftKey / date
export function coverWarnings(data, { employeeId, postId, shiftKey, date }) {
  const out = []
  const l = leaveOn(data.leave, employeeId, date)
  if (l) out.push(`On leave that day${l.typeLabel ? ` (${l.typeLabel.toLowerCase()})` : ""}.`)
  const byId = new Map(data.posts.map((p) => [p.id, p]))
  const elsewhere = []
  for (const [k, list] of assignments(data, date)) {
    if (k === `${postId}:${shiftKey}` || !list.some((x) => x.employeeId === employeeId)) continue
    const [pid, sk] = k.split(":")
    const post = byId.get(Number(pid))
    elsewhere.push(`${post?.name ?? "another post"} (${(post?.shifts.find((s) => s.key === sk)?.label ?? sk).toLowerCase()})`)
  }
  if (elsewhere.length) out.push(`Already on ${elsewhere.join(" and ")} that day: this makes a double shift.`)
  const own = data.patterns.filter((p) => p.employeeId === employeeId && byId.has(p.postId))
  const dayOff = !own.some((p) => patternShift(p, date, byId.get(p.postId))) && !officeDay(data.patterns, employeeId, date)
  if (dayOff && !l) out.push("It's their day off: pay overtime or give another day off.")
  return out
}

// A regular duty in words: "Main gate · Day, Mon–Sat, swaps day/night weekly"
export function describeDuty(p, post) {
  const shift = post?.shifts.find((s) => s.key === p.shiftKey)
  return [`${post?.name ?? "Removed post"} · ${shift?.label ?? p.shiftKey}`, daysText(p.days), p.rotate ? "swaps day and night every other week" : null, p.weeks ? `${p.weeks} weeks only` : null]
    .filter(Boolean)
    .join(", ")
}

// "Ghulam Rasool" → "Ghulam R."
export const shortName = (n = "") => {
  const [first, ...rest] = n.trim().split(/\s+/)
  return rest.length ? `${first} ${rest.at(-1)[0]}.` : first
}

// Week rows grouped under their project, in order (head office last): [{ name, rows }]
export function groupByProject(rows) {
  const groups = []
  for (const r of rows) {
    const name = r.project ?? "Head office"
    if (groups.at(-1)?.name !== name) groups.push({ name, rows: [] })
    groups.at(-1).rows.push(r)
  }
  return groups
}
