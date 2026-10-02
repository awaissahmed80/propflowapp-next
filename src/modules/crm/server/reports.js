import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { toHex } from "@/lib/color"
import { peopleByIds } from "@/modules/users/server/queries"
import { OPEN_STEPS } from "../constants"
import { scoped } from "./context"
import { assignableAgents } from "./queries"

// CRM's ready-made reports, in the shape lib/reports.js describes: each loads plain rows for its
// columns, and the same result drives the table, chart, print, PDF and Excel. Only leads this
// person may see count (an agent's reports are about their own leads).
// load(ctx, { period, project }): period is a PERIODS key ("" = all time), project a lowercased code.

const DAY = 86_400_000
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)}`
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
const median = (list) => {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const hoursText = (h) => (h == null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`)

// Periods, in Pakistan time: [from, to) as dates
const pkDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d)
const pkStart = (ymd) => new Date(`${ymd}T00:00:00+05:00`)
export const PERIODS = {
  "this-week": "This week",
  "this-month": "This month",
  "last-month": "Last month",
  "last-90-days": "Last 90 days",
  "this-quarter": "This quarter",
  "this-year": "This year",
}
export function periodRange(period, now = new Date()) {
  const today = pkDate(now)
  const [y, m] = today.split("-").map(Number)
  const end = new Date(now.getTime() + 1)
  if (period === "this-week") {
    const start = pkStart(today)
    const weekday = (new Date(start.getTime() + 5 * 3_600_000).getUTCDay() + 6) % 7 // Monday = 0
    return [new Date(start.getTime() - weekday * DAY), end]
  }
  if (period === "this-month") return [pkStart(`${today.slice(0, 7)}-01`), end]
  if (period === "last-month") {
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    return [pkStart(`${py}-${String(pm).padStart(2, "0")}-01`), pkStart(`${today.slice(0, 7)}-01`)]
  }
  if (period === "last-90-days") return [new Date(now.getTime() - 90 * DAY), end]
  if (period === "this-quarter") return [pkStart(`${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`), end]
  if (period === "this-year") return [pkStart(`${y}-01-01`), end]
  return [new Date(0), end]
}
const within = (d, [from, to]) => d && new Date(d) >= from && new Date(d) < to

// Everything a report needs, narrowed to one project when picked
async function crmData(ctx, { period, project }) {
  const range = periodRange(period)
  const [allLeads, lists, projects] = await Promise.all([
    scoped(ctx, live(ctx.db, "leads")).select(
      "id",
      "code",
      "name",
      "status",
      "source",
      "lossReason",
      "priority",
      "projectId",
      "assignedTo",
      "teamId",
      "budgetMin",
      "budgetMax",
      "createdAt",
      "firstContactAt",
      "lastContactAt",
      "closedAt",
      "archivedAt",
    ),
    getLookups(ctx.db, ["lead-source", "lead-status", "loss-reason", "activity-type", "activity-outcome"]),
    live(ctx.db, "projects").select("id", "code", "name"),
  ])
  const projectId = project ? projects.find((p) => p.code.toLowerCase() === project)?.id : null
  const leads = project ? allLeads.filter((l) => l.projectId === projectId) : allLeads
  const ids = leads.map((l) => l.id)
  const [activities, bookings] = await Promise.all([
    ids.length ? live(ctx.db, "leadActivities").whereIn("leadId", ids).whereNot({ type: "system" }).select("leadId", "type", "status", "at", "doneAt", "outcome", "by", "createdAt", "projectId") : [],
    ids.length ? live(ctx.db, "bookings").whereIn("leadId", ids).whereNotIn("status", ["cancelled", "refunded"]).select("leadId", "agreedPrice", "bookedAt", "projectId", "createdBy") : [],
  ])
  const people = await peopleByIds([...leads.map((l) => l.assignedTo), ...activities.map((a) => a.by)])
  const label = (key) => (v) => lists[key].find((x) => x.value === v)?.label ?? v
  return {
    range,
    leads,
    inPeriod: leads.filter((l) => within(l.createdAt, range)),
    activities,
    bookings,
    people,
    projects: new Map(projects.map((p) => [p.id, p.name])),
    source: label("lead-source"),
    status: label("lead-status"),
    reason: label("loss-reason"),
    type: label("activity-type"),
    outcomes: lists["activity-outcome"],
    statusColor: (v) => toHex(lists["lead-status"].find((x) => x.value === v)?.color) ?? "#94a3b8",
    name: (id) => people.get(id)?.name ?? "Unassigned",
  }
}

const isOpen = (l) => !l.archivedAt && OPEN_STEPS.includes(l.status)

export const REPORT_GROUPS = ["Pipeline", "Team", "Activity"]

export const REPORTS = [
  {
    id: "sources",
    group: "Pipeline",
    title: "Leads by source",
    description: "Where leads come from, how many were reached, visited the site and booked.",
    icon: "megaphone-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const visited = new Set(d.activities.filter((a) => a.type === "site-visit" && a.status === "done").map((a) => a.leadId))
      const map = new Map()
      for (const l of d.inPeriod) {
        const k = l.source ?? ""
        const r = map.get(k) ?? { id: k || "none", source: l.source ? d.source(l.source) : "No source", leads: 0, contacted: 0, visited: 0, booked: 0, lost: 0, open: 0 }
        r.leads++
        if (l.firstContactAt) r.contacted++
        if (visited.has(l.id)) r.visited++
        if (l.status === "booked") r.booked++
        else if (l.status === "lost") r.lost++
        else if (isOpen(l)) r.open++
        map.set(k, r)
      }
      const rows = [...map.values()].map((r) => ({ ...r, contactedPct: pct(r.contacted, r.leads), conversion: pct(r.booked, r.leads) })).sort((a, b) => b.leads - a.leads)
      const total = d.inPeriod.length
      const booked = rows.reduce((s, r) => s + r.booked, 0)
      return {
        columns: [
          { key: "source", header: "Source", width: 20 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "contacted", header: "Reached", type: "number", width: 9 },
          { key: "contactedPct", header: "Reached %", type: "pct", width: 10 },
          { key: "visited", header: "Site visits", type: "number", width: 10 },
          { key: "open", header: "Open", type: "number", width: 8 },
          { key: "booked", header: "Booked", type: "number", width: 8 },
          { key: "lost", header: "Lost", type: "number", width: 8 },
          { key: "conversion", header: "Booked %", type: "pct", width: 10 },
        ],
        rows,
        summary: [
          { label: "Leads", value: number(total) },
          { label: "Sources", value: number(rows.length) },
          { label: "Booked", value: number(booked) },
          { label: "Booked %", value: `${pct(booked, total)}%` },
        ],
        chart: rows.length
          ? {
              kind: "stacked",
              title: "Leads by source and where they are now",
              categoryKey: "source",
              series: [
                { key: "open", label: "Open", color: "#3b82f6" },
                { key: "booked", label: "Booked", color: d.statusColor("booked") },
                { key: "lost", label: "Lost", color: d.statusColor("lost") },
              ],
              data: rows,
            }
          : null,
        note: rows.length ? null : "No leads in this period.",
      }
    },
  },
  {
    id: "pipeline",
    group: "Pipeline",
    title: "Pipeline by stage",
    description: "Open leads at each stage, how long they've waited, and how many have gone quiet.",
    icon: "filter-3-line",
    filters: ["project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const now = Date.now()
      const open = d.leads.filter(isOpen)
      const rows = OPEN_STEPS.map((st) => {
        const list = open.filter((l) => l.status === st)
        const ages = list.map((l) => (now - new Date(l.createdAt).getTime()) / DAY)
        const quiet = list.filter((l) => now - new Date(l.lastContactAt ?? l.createdAt).getTime() > 14 * DAY).length
        const budgets = list.map((l) => Number(l.budgetMax || l.budgetMin || 0)).filter(Boolean)
        return {
          id: st,
          stage: d.status(st),
          leads: list.length,
          share: pct(list.length, open.length),
          age: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
          quiet,
          budget: budgets.length ? budgets.reduce((a, b) => a + b, 0) : null,
        }
      })
      return {
        columns: [
          { key: "stage", header: "Stage", width: 22 },
          { key: "leads", header: "Open leads", type: "number", width: 11 },
          { key: "share", header: "Share", type: "pct", width: 8 },
          { key: "age", header: "Avg age (days)", type: "number", width: 13 },
          { key: "quiet", header: "Quiet 14+ days", type: "number", width: 13 },
          { key: "budget", header: "Budgets (total)", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Open leads", value: number(open.length) },
          { label: "In negotiation", value: number(open.filter((l) => l.status === "negotiation").length) },
          { label: "Quiet 14+ days", value: number(rows.reduce((s, r) => s + r.quiet, 0)) },
          { label: "Not contacted yet", value: number(open.filter((l) => !l.firstContactAt).length) },
        ],
        chart: open.length ? { kind: "bar", title: "Open leads by stage", categoryKey: "stage", valueKey: "leads", valueLabel: "Open leads", data: rows } : null,
      }
    },
  },
  {
    id: "projects",
    group: "Pipeline",
    title: "Leads by project",
    description: "Demand for each project: leads, bookings, conversion and the value booked.",
    icon: "community-line",
    filters: ["period"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const map = new Map()
      const row = (id) => map.get(id ?? 0) ?? { id: String(id ?? "none"), project: id ? (d.projects.get(id) ?? "—") : "No project yet", leads: 0, open: 0, booked: 0, lost: 0, value: 0 }
      for (const l of d.inPeriod) {
        const r = row(l.projectId)
        r.leads++
        if (l.status === "booked") r.booked++
        else if (l.status === "lost") r.lost++
        else if (isOpen(l)) r.open++
        map.set(l.projectId ?? 0, r)
      }
      for (const b of d.bookings.filter((x) => within(x.bookedAt, d.range))) {
        const r = row(b.projectId)
        r.value += Number(b.agreedPrice)
        map.set(b.projectId ?? 0, r)
      }
      const rows = [...map.values()].map((r) => ({ ...r, conversion: pct(r.booked, r.leads) })).sort((a, b) => b.leads - a.leads)
      return {
        columns: [
          { key: "project", header: "Project", width: 24 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "open", header: "Open", type: "number", width: 8 },
          { key: "booked", header: "Booked", type: "number", width: 8 },
          { key: "lost", header: "Lost", type: "number", width: 8 },
          { key: "conversion", header: "Booked %", type: "pct", width: 10 },
          { key: "value", header: "Value booked", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Leads", value: number(d.inPeriod.length) },
          { label: "Booked", value: number(rows.reduce((s, r) => s + r.booked, 0)) },
          { label: "Value booked", value: rs(rows.reduce((s, r) => s + r.value, 0)) },
          { label: "No project yet", value: number(d.inPeriod.filter((l) => !l.projectId).length) },
        ],
        chart: rows.length ? { kind: "bar", title: "Leads by project", categoryKey: "project", valueKey: "leads", valueLabel: "Leads", data: rows } : null,
        note: rows.length ? null : "No leads in this period.",
      }
    },
  },
  {
    id: "lost",
    group: "Pipeline",
    title: "Lost lead analysis",
    description: "Why leads were lost, at which stage they dropped out, and where they came from.",
    icon: "close-circle-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const lost = d.leads.filter((l) => l.status === "lost" && within(l.closedAt, d.range))
      const closed = d.leads.filter((l) => ["booked", "lost"].includes(l.status) && within(l.closedAt, d.range)).length
      const map = new Map()
      for (const l of lost) {
        const k = l.lossReason ?? ""
        const r = map.get(k) ?? { id: k || "none", reason: l.lossReason ? d.reason(l.lossReason) : "No reason given", leads: 0, sources: new Map(), reached: 0 }
        r.leads++
        if (l.firstContactAt) r.reached++
        r.sources.set(l.source, (r.sources.get(l.source) ?? 0) + 1)
        map.set(k, r)
      }
      const rows = [...map.values()]
        .map(({ sources, ...r }) => {
          const top = [...sources.entries()].sort((a, b) => b[1] - a[1])[0]
          return { ...r, share: pct(r.leads, lost.length), topSource: top?.[0] ? d.source(top[0]) : "—", notReached: r.leads - r.reached }
        })
        .sort((a, b) => b.leads - a.leads)
      return {
        columns: [
          { key: "reason", header: "Reason", width: 28 },
          { key: "leads", header: "Lost", type: "number", width: 8 },
          { key: "share", header: "Share", type: "pct", width: 8 },
          { key: "notReached", header: "Never reached", type: "number", width: 13 },
          { key: "topSource", header: "Mostly from", width: 18 },
        ],
        rows,
        summary: [
          { label: "Lost", value: number(lost.length) },
          { label: "Of leads closed", value: `${pct(lost.length, closed)}%` },
          { label: "Never reached", value: number(lost.filter((l) => !l.firstContactAt).length) },
          { label: "Top reason", value: rows[0]?.reason ?? "—" },
        ],
        chart: rows.length ? { kind: "bar", title: "Lost leads by reason", categoryKey: "reason", valueKey: "leads", valueLabel: "Lost", data: rows } : null,
        note: rows.length ? null : "No leads lost in this period.",
      }
    },
  },
  {
    id: "agents",
    group: "Team",
    title: "Agent performance",
    description: "Per agent: leads, calls and messages, visits, bookings, conversion and value booked.",
    icon: "user-star-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const rows = agentRows(d)
      return {
        columns: [
          { key: "agent", header: "Agent", width: 20 },
          { key: "leads", header: "New leads", type: "number", width: 10 },
          { key: "open", header: "Open now", type: "number", width: 9 },
          { key: "touches", header: "Calls & messages", type: "number", width: 14 },
          { key: "visits", header: "Site visits", type: "number", width: 10 },
          { key: "meetings", header: "Meetings", type: "number", width: 9 },
          { key: "booked", header: "Booked", type: "number", width: 8 },
          { key: "conversion", header: "Booked %", type: "pct", width: 10 },
          { key: "value", header: "Value booked", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Agents", value: number(rows.filter((r) => r.id !== "none").length) },
          { label: "Calls & messages", value: number(rows.reduce((s, r) => s + r.touches, 0)) },
          { label: "Booked", value: number(rows.reduce((s, r) => s + r.booked, 0)) },
          { label: "Value booked", value: rs(rows.reduce((s, r) => s + r.value, 0)) },
        ],
        chart: rows.some((r) => r.booked) ? { kind: "bar", title: "Bookings by agent", categoryKey: "agent", valueKey: "booked", valueLabel: "Booked", data: rows } : null,
      }
    },
  },
  {
    id: "response",
    group: "Team",
    title: "Response times",
    description: "How fast new leads are first reached, per agent: median time, within an hour, within a day.",
    icon: "timer-flash-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const map = new Map()
      for (const l of d.inPeriod) {
        const k = l.assignedTo ?? 0
        const r = map.get(k) ?? { id: String(k || "none"), agent: d.name(l.assignedTo), leads: 0, hours: [], waiting: 0 }
        r.leads++
        if (l.firstContactAt) r.hours.push((new Date(l.firstContactAt) - new Date(l.createdAt)) / 3_600_000)
        else if (isOpen(l)) r.waiting++
        map.set(k, r)
      }
      const rows = [...map.values()]
        .map(({ hours, ...r }) => ({
          ...r,
          reached: hours.length,
          median: hoursText(median(hours)),
          medianHours: median(hours),
          hour: pct(hours.filter((h) => h <= 1).length, r.leads),
          day: pct(hours.filter((h) => h <= 24).length, r.leads),
        }))
        .sort((a, b) => (a.medianHours ?? Infinity) - (b.medianHours ?? Infinity))
      const all = d.inPeriod.filter((l) => l.firstContactAt).map((l) => (new Date(l.firstContactAt) - new Date(l.createdAt)) / 3_600_000)
      return {
        columns: [
          { key: "agent", header: "Agent", width: 20 },
          { key: "leads", header: "New leads", type: "number", width: 10 },
          { key: "reached", header: "Reached", type: "number", width: 9 },
          { key: "median", header: "Median first response", width: 18 },
          { key: "hour", header: "Within 1 hour", type: "pct", width: 12 },
          { key: "day", header: "Within 24 hours", type: "pct", width: 14 },
          { key: "waiting", header: "Not reached yet", type: "number", width: 14 },
        ],
        rows: rows.map(({ medianHours, ...r }) => r),
        summary: [
          { label: "New leads", value: number(d.inPeriod.length) },
          { label: "Median first response", value: hoursText(median(all)) },
          { label: "Within 1 hour", value: `${pct(all.filter((h) => h <= 1).length, d.inPeriod.length)}%` },
          { label: "Not reached yet", value: number(rows.reduce((s, r) => s + r.waiting, 0)) },
        ],
        note: d.inPeriod.length ? "A lead counts as reached the first time a call, message or visit is logged where you got through." : "No new leads in this period.",
      }
    },
  },
  {
    id: "follow-ups",
    group: "Activity",
    title: "Follow-up discipline",
    description: "Follow-ups that fell due in the period: done, done on time, missed, and overdue now.",
    icon: "alarm-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const now = new Date()
      // Planned items (created before they were done) that fell due in the period
      const planned = d.activities.filter((a) => within(a.at, d.range) && (a.status === "planned" || (a.doneAt && new Date(a.doneAt) - new Date(a.createdAt) > 60_000)))
      const map = new Map()
      for (const a of planned) {
        const k = a.by ?? 0
        const r = map.get(k) ?? { id: String(k || "none"), agent: d.name(a.by), due: 0, done: 0, onTime: 0, missed: 0, overdue: 0 }
        r.due++
        if (a.status === "done") {
          r.done++
          // On time: done the same day it was due, or earlier
          if (pkDate(new Date(a.doneAt)) <= pkDate(new Date(a.at))) r.onTime++
        } else if (a.status === "missed") r.missed++
        else if (new Date(a.at) < now) r.overdue++
        map.set(k, r)
      }
      const rows = [...map.values()].map((r) => ({ ...r, doneRate: pct(r.done, r.due), onTimeRate: pct(r.onTime, r.due) })).sort((a, b) => b.due - a.due)
      const t = (k) => rows.reduce((s, r) => s + r[k], 0)
      return {
        columns: [
          { key: "agent", header: "Agent", width: 20 },
          { key: "due", header: "Fell due", type: "number", width: 9 },
          { key: "done", header: "Done", type: "number", width: 8 },
          { key: "doneRate", header: "Done %", type: "pct", width: 8 },
          { key: "onTime", header: "On time", type: "number", width: 9 },
          { key: "onTimeRate", header: "On time %", type: "pct", width: 10 },
          { key: "missed", header: "Missed", type: "number", width: 8 },
          { key: "overdue", header: "Overdue now", type: "number", width: 12 },
        ],
        rows,
        summary: [
          { label: "Fell due", value: number(t("due")) },
          { label: "Done", value: `${pct(t("done"), t("due"))}%` },
          { label: "On time", value: `${pct(t("onTime"), t("due"))}%` },
          { label: "Overdue now", value: number(t("overdue")) },
        ],
        chart: rows.length
          ? {
              kind: "stacked",
              title: "Follow-ups by agent",
              categoryKey: "agent",
              series: [
                { key: "onTime", label: "On time", color: "#10b981" },
                { key: "late", label: "Done late", color: "#f59e0b" },
                { key: "missed", label: "Missed", color: "#94a3b8" },
                { key: "overdue", label: "Overdue", color: "#ef4444" },
              ],
              data: rows.map((r) => ({ ...r, late: r.done - r.onTime })),
            }
          : null,
        note: rows.length ? null : "No follow-ups fell due in this period.",
      }
    },
  },
  {
    id: "site-visits",
    group: "Activity",
    title: "Site visits",
    description: "Visits per project: planned, done, no-shows, show-up rate and how many went on to book.",
    icon: "map-pin-user-line",
    filters: ["period"],
    async load(ctx, values) {
      const d = await crmData(ctx, values)
      const leadById = new Map(d.leads.map((l) => [l.id, l]))
      const visits = d.activities.filter((a) => a.type === "site-visit" && within(a.doneAt ?? a.at, d.range))
      const map = new Map()
      for (const v of visits) {
        const pid = v.projectId ?? leadById.get(v.leadId)?.projectId ?? 0
        const r = map.get(pid) ?? { id: String(pid || "none"), project: pid ? (d.projects.get(pid) ?? "—") : "No project", planned: 0, done: 0, missed: 0, leads: new Set(), bookedLeads: new Set() }
        if (v.status === "planned") r.planned++
        else if (v.status === "done") {
          r.done++
          r.leads.add(v.leadId)
          if (leadById.get(v.leadId)?.status === "booked") r.bookedLeads.add(v.leadId)
        } else if (v.status === "missed") r.missed++
        map.set(pid, r)
      }
      const rows = [...map.values()]
        .map(({ leads, bookedLeads, ...r }) => ({ ...r, showRate: pct(r.done, r.done + r.missed), visitors: leads.size, booked: bookedLeads.size, conversion: pct(bookedLeads.size, leads.size) }))
        .sort((a, b) => b.done - a.done)
      const t = (k) => rows.reduce((s, r) => s + r[k], 0)
      return {
        columns: [
          { key: "project", header: "Project", width: 24 },
          { key: "planned", header: "Planned", type: "number", width: 9 },
          { key: "done", header: "Visited", type: "number", width: 9 },
          { key: "missed", header: "No-shows", type: "number", width: 9 },
          { key: "showRate", header: "Show-up %", type: "pct", width: 10 },
          { key: "visitors", header: "Visitors", type: "number", width: 9 },
          { key: "booked", header: "Booked", type: "number", width: 8 },
          { key: "conversion", header: "Visit → booking", type: "pct", width: 14 },
        ],
        rows,
        summary: [
          { label: "Visited", value: number(t("done")) },
          { label: "Show-up rate", value: `${pct(t("done"), t("done") + t("missed"))}%` },
          { label: "Still planned", value: number(t("planned")) },
          { label: "Visitors who booked", value: number(t("booked")) },
        ],
        chart: rows.some((r) => r.done) ? { kind: "bar", title: "Site visits done by project", categoryKey: "project", valueKey: "done", valueLabel: "Visited", data: rows } : null,
        note: rows.length ? null : "No site visits in this period.",
      }
    },
  },
]

// Per agent, for the Agent performance report and the leaderboard
function agentRows(d) {
  const leadById = new Map(d.leads.map((l) => [l.id, l]))
  const map = new Map()
  const row = (id) => map.get(id ?? 0) ?? { id: String(id || "none"), userId: id ?? null, agent: d.name(id), leads: 0, open: 0, touches: 0, visits: 0, meetings: 0, booked: 0, closed: 0, value: 0 }
  const put = (id, r) => map.set(id ?? 0, r)
  for (const l of d.leads) {
    const r = row(l.assignedTo)
    if (within(l.createdAt, d.range)) r.leads++
    if (isOpen(l)) r.open++
    if (["booked", "lost"].includes(l.status) && within(l.closedAt, d.range)) {
      r.closed++
      if (l.status === "booked") r.booked++
    }
    put(l.assignedTo, r)
  }
  for (const a of d.activities.filter((x) => x.status === "done" && within(x.doneAt ?? x.at, d.range))) {
    const r = row(a.by)
    if (a.type === "site-visit") r.visits++
    else if (a.type === "meeting") r.meetings++
    else r.touches++
    put(a.by, r)
  }
  for (const b of d.bookings.filter((x) => within(x.bookedAt, d.range))) {
    const owner = leadById.get(b.leadId)?.assignedTo ?? b.createdBy
    const r = row(owner)
    r.value += Number(b.agreedPrice)
    put(owner, r)
  }
  return [...map.values()].map((r) => ({ ...r, conversion: pct(r.booked, r.closed) })).sort((a, b) => b.booked - a.booked || b.value - a.value || b.touches - a.touches)
}

export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null

// What the browser needs to list reports (no functions)
export const reportMeta = (r) => ({ id: r.id, group: r.group, title: r.title, description: r.description, icon: r.icon, filters: r.filters ?? [] })

// Filter choices: period, and projects by their lowercased code
export async function reportFilters(ctx) {
  const projects = await live(ctx.db, "projects").orderBy("name").select("code", "name")
  return {
    period: { label: "Period", all: "All time", options: Object.entries(PERIODS).map(([value, label]) => ({ value, label })) },
    project: { label: "Project", all: "All projects", options: projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name })) },
  }
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

// Leaderboard: every agent in the workspace (counts only, so everyone sees the same board),
// for one period, with their team
export async function leaderboard(ctx, period) {
  const d = await crmData({ ...ctx, scope: "all" }, { period, project: "" })
  const [agents, teams] = await Promise.all([assignableAgents(ctx), live(ctx.db, "teams").select("id", "name")])
  const rows = agentRows(d).filter((r) => r.userId)
  const byId = new Map(rows.map((r) => [r.userId, r]))
  const firstResponse = new Map()
  for (const l of d.inPeriod.filter((x) => x.firstContactAt && x.assignedTo))
    firstResponse.set(l.assignedTo, [...(firstResponse.get(l.assignedTo) ?? []), (new Date(l.firstContactAt) - new Date(l.createdAt)) / 3_600_000])
  const board = agents.map((a) => {
    const r = byId.get(a.id) ?? { leads: 0, open: 0, touches: 0, visits: 0, meetings: 0, booked: 0, closed: 0, value: 0, conversion: 0 }
    const m = median(firstResponse.get(a.id) ?? [])
    return { id: a.id, name: a.name, avatarUrl: a.avatarUrl, team: a.team, teamId: a.teamId, ...r, response: m, responseText: hoursText(m) }
  })
  const teamRows = teams
    .map((t) => {
      const members = board.filter((b) => b.teamId === t.id)
      const sum = (k) => members.reduce((s, b) => s + b[k], 0)
      return { id: t.id, name: t.name, members: members.length, booked: sum("booked"), value: sum("value"), visits: sum("visits"), touches: sum("touches") }
    })
    .filter((t) => t.members)
  return { range: d.range.map((x) => x.toISOString()), board, teams: teamRows }
}
