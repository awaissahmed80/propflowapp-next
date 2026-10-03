import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { PERIODS, periodRange } from "@/modules/crm/server/reports"
import { GOAL_METRIC, dateRange, displayStatus, formatGoal } from "../constants"

// Campaigns' ready-made reports, in the shape lib/reports.js describes (same table, chart, print,
// PDF and Excel as CRM and Estate). Results come from CRM leads attributed to campaigns, forms and
// landing pages; the period narrows leads by when they came in. Spend and budget are a campaign's
// totals (they aren't recorded by date).
// load(ctx, { period, project, campaign }): period a PERIODS key ("" = all time), project and
// campaign lowercased codes.

const DAY = 86_400_000
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)}`
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
const day = (d) => (d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)) : null)
const within = (d, [from, to]) => d && new Date(d) >= from && new Date(d) < to
const median = (list) => {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const shortDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "")

// Everything a report needs, narrowed by the filters
async function data(ctx, { period = "", project = "", campaign = "" } = {}) {
  const range = periodRange(period)
  const [campaignRows, projects, lists, forms, pages] = await Promise.all([
    live(ctx.db, "campaigns").orderBy("startDate", "desc"),
    live(ctx.db, "projects").select("id", "code", "name"),
    getLookups(ctx.db, ["campaign-status", "campaign-objective", "lead-source", "loss-reason"]),
    live(ctx.db, "leadForms").select("id", "code", "name", "status", "campaignId", "projectId", "views"),
    live(ctx.db, "landingPages").select("id", "code", "name", "slug", "status", "campaignId", "projectId", "views", "formId"),
  ])
  const projectId = project ? (projects.find((p) => p.code.toLowerCase() === project)?.id ?? -1) : null
  const campaigns = campaignRows
    .map((c) => {
      const base = {
        id: c.id,
        code: c.code,
        name: c.name,
        objective: c.objective,
        status: c.status,
        projectId: c.projectId,
        startDate: day(c.startDate),
        endDate: day(c.endDate),
        channels: json(c.channels, []),
        goals: json(c.goals, []),
      }
      return { ...base, displayStatus: displayStatus(base) }
    })
    .filter((c) => (!projectId || c.projectId === projectId) && (!campaign || c.code.toLowerCase() === campaign))
  const campaignIds = new Set(campaigns.map((c) => c.id))

  const allLeads = await live(ctx.db, "leads")
    .where((q) => q.whereNotNull("campaignId").orWhereNotNull("formId"))
    .select("id", "campaignId", "formId", "landingPageId", "source", "status", "lossReason", "assignedTo", "projectId", "createdAt", "firstContactAt")
  const leads = allLeads.filter((l) => (!campaign && !project ? true : l.campaignId ? campaignIds.has(l.campaignId) : !campaign && (!projectId || l.projectId === projectId)) && within(l.createdAt, range))
  const ids = leads.map((l) => l.id)
  const visits = ids.length ? new Set((await live(ctx.db, "leadActivities").whereIn("leadId", ids).where({ type: "site-visit", status: "done" }).select("leadId")).map((a) => a.leadId)) : new Set()
  const rows = leads.map((l) => ({
    ...l,
    contacted: l.status !== "new" || Boolean(l.firstContactAt),
    visited: visits.has(l.id) || ["site-visit", "negotiation", "booked"].includes(l.status),
    booked: l.status === "booked",
    lost: l.status === "lost",
    open: !["booked", "lost"].includes(l.status),
  }))
  const label = (key) => (v) => lists[key].find((x) => x.value === v)?.label ?? v ?? "—"
  return {
    range,
    period,
    campaigns,
    leads: rows,
    forms: forms.filter((f) => (!campaign || campaignIds.has(f.campaignId)) && (!projectId || f.projectId === projectId || campaignIds.has(f.campaignId))),
    pages: pages.filter((p) => (!campaign || campaignIds.has(p.campaignId)) && (!projectId || p.projectId === projectId || campaignIds.has(p.campaignId))),
    campaignName: (id) => campaigns.find((c) => c.id === id)?.name ?? campaignRows.find((c) => c.id === id)?.name ?? "—",
    status: label("campaign-status"),
    objective: label("campaign-objective"),
    channel: label("lead-source"),
    reason: label("loss-reason"),
  }
}

// Results for a set of leads and a spend
function results(leads, spend) {
  const booked = leads.filter((l) => l.booked).length
  return {
    leads: leads.length,
    contacted: leads.filter((l) => l.contacted).length,
    visits: leads.filter((l) => l.visited).length,
    bookings: booked,
    open: leads.filter((l) => l.open).length,
    lost: leads.filter((l) => l.lost).length,
    cpl: leads.length && spend ? Math.round(spend / leads.length) : null,
    cpb: booked && spend ? Math.round(spend / booked) : null,
  }
}
const noneNote = (d, what = "campaign leads") => `No ${what}${d.period ? ` in ${PERIODS[d.period]?.toLowerCase() ?? "this period"}` : ""}.`

export const REPORT_GROUPS = ["Campaigns", "Channels & leads", "Forms & pages"]

export const REPORTS = [
  {
    id: "campaign-performance",
    group: "Campaigns",
    title: "Campaign performance",
    description: "Spend, leads, cost per lead, site visits and bookings for every campaign.",
    icon: "megaphone-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const rows = d.campaigns.map((c) => {
        const spend = sum(c.channels, (ch) => ch.spend)
        const r = results(
          d.leads.filter((l) => l.campaignId === c.id),
          spend,
        )
        return {
          id: c.code,
          name: c.name,
          status: d.status(c.displayStatus),
          objective: c.objective ? d.objective(c.objective) : "—",
          dates: dateRange(c),
          budget: sum(c.channels, (ch) => ch.budget),
          spend,
          ...r,
          rate: pct(r.bookings, r.leads),
        }
      })
      const spend = sum(rows, (r) => r.spend)
      const leads = sum(rows, (r) => r.leads)
      const bookings = sum(rows, (r) => r.bookings)
      return {
        columns: [
          { key: "name", header: "Campaign", width: 28 },
          { key: "status", header: "Status", width: 10 },
          { key: "objective", header: "Objective", width: 18 },
          { key: "dates", header: "Dates", width: 20 },
          { key: "budget", header: "Budget", type: "pkr", width: 12 },
          { key: "spend", header: "Spend", type: "pkr", width: 12 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "cpl", header: "Cost / lead", type: "pkr", width: 12 },
          { key: "visits", header: "Site visits", type: "number", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
          { key: "cpb", header: "Cost / booking", type: "pkr", width: 14 },
          { key: "rate", header: "Lead to booking", type: "pct", width: 12 },
        ],
        rows,
        summary: [
          { label: "Spend", value: rs(spend) },
          { label: "Leads", value: number(leads) },
          { label: "Cost per lead", value: leads && spend ? rs(Math.round(spend / leads)) : "—" },
          { label: "Bookings", value: number(bookings) },
        ],
        chart: rows.some((r) => r.leads) ? { kind: "bar", title: "Leads by campaign", categoryKey: "name", valueKey: "leads", valueLabel: "Leads", data: rows.filter((r) => r.leads).slice(0, 12) } : null,
        note: rows.length ? null : "No campaigns yet.",
      }
    },
  },
  {
    id: "goals",
    group: "Campaigns",
    title: "Goals & pacing",
    description: "Each goal against its target, and whether the campaign is on pace for the time gone.",
    icon: "focus-3-line",
    filters: ["project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const now = Date.now()
      const rows = []
      for (const c of d.campaigns) {
        const spend = sum(c.channels, (ch) => ch.spend)
        const r = results(
          d.leads.filter((l) => l.campaignId === c.id),
          spend,
        )
        const start = c.startDate ? new Date(c.startDate).getTime() : null
        const end = c.endDate ? new Date(c.endDate).getTime() + DAY : null
        const elapsed = start && end ? Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100))) : null
        for (const [i, g] of c.goals.entries()) {
          const metric = GOAL_METRIC[g.metric]
          const actual = { leads: r.leads, "site-visits": r.visits, bookings: r.bookings, cpl: r.cpl }[g.metric] ?? null
          const achieved = actual == null || !g.target ? null : metric?.lowerIsBetter ? (actual ? Math.round((g.target / actual) * 100) : null) : Math.round((actual / g.target) * 100)
          const ended = c.displayStatus === "completed"
          const pace =
            achieved == null
              ? "—"
              : ended
                ? achieved >= 100
                  ? "Hit"
                  : "Missed"
                : metric?.lowerIsBetter
                  ? achieved >= 100
                    ? "On target"
                    : "Over target"
                  : elapsed == null
                    ? "—"
                    : achieved >= elapsed + 10
                      ? "Ahead"
                      : achieved >= elapsed - 10
                        ? "On pace"
                        : "Behind"
          rows.push({ id: `${c.code}-${i}`, campaign: c.name, goal: metric?.label ?? g.metric, targetText: formatGoal(g.metric, g.target), actualText: formatGoal(g.metric, actual), achieved, elapsed, pace })
        }
      }
      return {
        columns: [
          { key: "campaign", header: "Campaign", width: 28 },
          { key: "goal", header: "Goal", width: 14 },
          { key: "targetText", header: "Target", width: 12 },
          { key: "actualText", header: "Actual", width: 12 },
          { key: "achieved", header: "Achieved", type: "pct", width: 10 },
          { key: "elapsed", header: "Time gone", type: "pct", width: 10 },
          { key: "pace", header: "Pace", width: 12 },
        ],
        rows,
        summary: [
          { label: "Goals", value: number(rows.length) },
          { label: "Ahead or on pace", value: number(rows.filter((r) => ["Ahead", "On pace", "On target", "Hit"].includes(r.pace)).length) },
          { label: "Behind", value: number(rows.filter((r) => ["Behind", "Over target", "Missed"].includes(r.pace)).length) },
        ],
        note: rows.length ? null : "No goals set on these campaigns. Add goals when editing a campaign.",
      }
    },
  },
  {
    id: "channels",
    group: "Channels & leads",
    title: "Channel performance",
    description: "Which channels bring leads cheapest, and which of those leads book.",
    icon: "broadcast-line",
    filters: ["period", "project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const map = new Map()
      for (const c of d.campaigns)
        for (const ch of c.channels) {
          const r = map.get(ch.channel) ?? { id: ch.channel, channel: d.channel(ch.channel), campaigns: 0, spend: 0, impressions: 0, clicks: 0, ids: new Set() }
          r.campaigns += 1
          r.spend += Number(ch.spend) || 0
          r.impressions += Number(ch.impressions) || 0
          r.clicks += Number(ch.clicks) || 0
          r.ids.add(c.id)
          map.set(ch.channel, r)
        }
      // Leads from a channel no campaign lists (e.g. walk-ins from a form) still count
      for (const l of d.leads) if (l.source && !map.has(l.source)) map.set(l.source, { id: l.source, channel: d.channel(l.source), campaigns: 0, spend: 0, impressions: 0, clicks: 0, ids: new Set() })
      const rows = [...map.entries()]
        .map(([key, r]) => {
          const res = results(
            d.leads.filter((l) => l.source === key),
            r.spend,
          )
          const { ids: _ids, ...rest } = r
          return { ...rest, impressions: r.impressions || null, clicks: r.clicks || null, ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : null, ...res }
        })
        .sort((a, b) => b.leads - a.leads)
      return {
        columns: [
          { key: "channel", header: "Channel", width: 18 },
          { key: "campaigns", header: "Campaigns", type: "number", width: 10 },
          { key: "spend", header: "Spend", type: "pkr", width: 12 },
          { key: "impressions", header: "Impressions", type: "number", width: 12 },
          { key: "clicks", header: "Clicks", type: "number", width: 10 },
          { key: "ctr", header: "Click rate", type: "pct", width: 10 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "cpl", header: "Cost / lead", type: "pkr", width: 12 },
          { key: "visits", header: "Site visits", type: "number", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
          { key: "cpb", header: "Cost / booking", type: "pkr", width: 14 },
        ],
        rows,
        summary: [
          { label: "Channels", value: number(rows.length) },
          { label: "Leads", value: number(sum(rows, (r) => r.leads)) },
          { label: "Spend", value: rs(sum(rows, (r) => r.spend)) },
          { label: "Bookings", value: number(sum(rows, (r) => r.bookings)) },
        ],
        chart: rows.some((r) => r.leads) ? { kind: "bar", title: "Leads by channel", categoryKey: "channel", valueKey: "leads", valueLabel: "Leads", data: rows.filter((r) => r.leads) } : null,
        note: rows.length ? null : noneNote(d),
      }
    },
  },
  {
    id: "funnel",
    group: "Channels & leads",
    title: "Lead funnel by campaign",
    description: "How campaign leads move from first call to site visit to booking, and why they're lost.",
    icon: "filter-3-line",
    filters: ["period", "project"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const rows = d.campaigns
        .map((c) => {
          const own = d.leads.filter((l) => l.campaignId === c.id)
          const r = results(own, 0)
          const reasons = new Map()
          for (const l of own.filter((x) => x.lost && x.lossReason)) reasons.set(l.lossReason, (reasons.get(l.lossReason) ?? 0) + 1)
          const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]
          return {
            id: c.code,
            campaign: c.name,
            leads: r.leads,
            contacted: pct(r.contacted, r.leads),
            visited: pct(r.visits, r.leads),
            booked: pct(r.bookings, r.leads),
            open: r.open,
            lost: r.lost,
            reason: top ? d.reason(top[0]) : "—",
          }
        })
        .filter((r) => r.leads)
      const all = results(d.leads, 0)
      return {
        columns: [
          { key: "campaign", header: "Campaign", width: 28 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "contacted", header: "Contacted", type: "pct", width: 10 },
          { key: "visited", header: "Site visit", type: "pct", width: 10 },
          { key: "booked", header: "Booked", type: "pct", width: 10 },
          { key: "open", header: "Still open", type: "number", width: 10 },
          { key: "lost", header: "Lost", type: "number", width: 8 },
          { key: "reason", header: "Top loss reason", width: 20 },
        ],
        rows,
        summary: [
          { label: "Leads", value: number(all.leads) },
          { label: "Contacted", value: `${pct(all.contacted, all.leads) ?? 0}%` },
          { label: "Site visit", value: `${pct(all.visits, all.leads) ?? 0}%` },
          { label: "Booked", value: `${pct(all.bookings, all.leads) ?? 0}%` },
        ],
        note: rows.length ? null : noneNote(d),
      }
    },
  },
  {
    id: "weekly",
    group: "Channels & leads",
    title: "Leads by week",
    description: "Campaign leads per week for the last 12 weeks, and how many went on to visit and book.",
    icon: "calendar-2-line",
    filters: ["project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, { ...values, period: "" })
      // Weeks start on Monday (Pakistan time)
      const monday = (t) => {
        const local = new Date(new Date(t).getTime() + 5 * 3_600_000)
        const wd = (local.getUTCDay() + 6) % 7
        return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - wd))
      }
      const thisWeek = monday(Date.now()).getTime()
      const weeks = Array.from({ length: 12 }, (_, i) => thisWeek - (11 - i) * 7 * DAY)
      const rows = weeks.map((w) => {
        const own = d.leads.filter((l) => monday(l.createdAt).getTime() === w)
        const r = results(own, 0)
        const by = new Map()
        for (const l of own) by.set(l.source, (by.get(l.source) ?? 0) + 1)
        const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
        return { id: String(w), week: shortDate(w), leads: r.leads, contacted: r.contacted, visits: r.visits, bookings: r.bookings, top: top ? d.channel(top[0]) : "—" }
      })
      return {
        columns: [
          { key: "week", header: "Week of", width: 14 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "contacted", header: "Contacted", type: "number", width: 10 },
          { key: "visits", header: "Site visits", type: "number", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
          { key: "top", header: "Top channel", width: 16 },
        ],
        rows,
        summary: [
          { label: "Leads (12 weeks)", value: number(sum(rows, (r) => r.leads)) },
          { label: "Busiest week", value: rows.some((r) => r.leads) ? [...rows].sort((a, b) => b.leads - a.leads)[0].week : "—" },
          { label: "Bookings", value: number(sum(rows, (r) => r.bookings)) },
        ],
        chart: rows.some((r) => r.leads) ? { kind: "bar", title: "Leads per week", categoryKey: "week", valueKey: "leads", valueLabel: "Leads", data: rows } : null,
        note: rows.some((r) => r.leads) ? null : "No campaign leads in the last 12 weeks.",
      }
    },
  },
  {
    id: "speed-to-lead",
    group: "Channels & leads",
    title: "Agent follow-up on campaign leads",
    description: "How fast agents first contact campaign leads, and how many visit and book. Paid leads go cold within hours.",
    icon: "timer-flash-line",
    filters: ["period", "project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const people = await peopleByIds(d.leads.map((l) => l.assignedTo))
      const map = new Map()
      for (const l of d.leads) {
        const k = l.assignedTo ?? 0
        const r = map.get(k) ?? { id: String(k), agent: people.get(l.assignedTo)?.name ?? "Unassigned", list: [] }
        r.list.push(l)
        map.set(k, r)
      }
      const rows = [...map.values()]
        .map(({ list, ...r }) => {
          const res = results(list, 0)
          const hours = list.filter((l) => l.firstContactAt).map((l) => (new Date(l.firstContactAt) - new Date(l.createdAt)) / 3_600_000)
          const m = median(hours)
          return {
            ...r,
            leads: res.leads,
            waiting: list.filter((l) => l.open && !l.contacted).length,
            hours: m == null ? null : Math.round(m * 10) / 10,
            within: hours.length ? pct(hours.filter((h) => h <= 1).length, hours.length) : null,
            visits: res.visits,
            bookings: res.bookings,
            rate: pct(res.bookings, res.leads),
          }
        })
        .sort((a, b) => b.leads - a.leads)
      return {
        columns: [
          { key: "agent", header: "Agent", width: 20 },
          { key: "leads", header: "Leads", type: "number", width: 8 },
          { key: "waiting", header: "Not contacted", type: "number", width: 12 },
          { key: "hours", header: "Hours to first contact", type: "number", width: 14 },
          { key: "within", header: "Within 1 hour", type: "pct", width: 12 },
          { key: "visits", header: "Site visits", type: "number", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
          { key: "rate", header: "Lead to booking", type: "pct", width: 12 },
        ],
        rows,
        summary: [
          { label: "Agents", value: number(rows.length) },
          { label: "Not contacted yet", value: number(sum(rows, (r) => r.waiting)) },
          { label: "Bookings", value: number(sum(rows, (r) => r.bookings)) },
        ],
        note: rows.length ? "Hours to first contact is the middle value (median) per agent." : noneNote(d),
      }
    },
  },
  {
    id: "forms",
    group: "Forms & pages",
    title: "Lead form conversion",
    description: "Views, entries and conversion for each lead form, and how many entries book.",
    icon: "survey-line",
    filters: ["period", "project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const rows = d.forms
        .map((f) => {
          const own = d.leads.filter((l) => l.formId === f.id)
          const last = own.reduce((m, l) => (!m || l.createdAt > m ? l.createdAt : m), null)
          return {
            id: f.code,
            form: f.name,
            campaign: f.campaignId ? d.campaignName(f.campaignId) : "—",
            status: f.status === "active" ? "Accepting entries" : "Paused",
            views: Number(f.views ?? 0),
            entries: own.length,
            conversion: pct(own.length, Number(f.views ?? 0)),
            bookings: own.filter((l) => l.booked).length,
            last: last ? shortDate(last) : "—",
          }
        })
        .sort((a, b) => b.entries - a.entries)
      return {
        columns: [
          { key: "form", header: "Form", width: 26 },
          { key: "campaign", header: "Campaign", width: 24 },
          { key: "status", header: "Status", width: 14 },
          { key: "views", header: "Views", type: "number", width: 10 },
          { key: "entries", header: "Entries", type: "number", width: 8 },
          { key: "conversion", header: "Conversion", type: "pct", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
          { key: "last", header: "Last entry", width: 14 },
        ],
        rows,
        summary: [
          { label: "Forms", value: number(rows.length) },
          { label: "Entries", value: number(sum(rows, (r) => r.entries)) },
          { label: "Bookings", value: number(sum(rows, (r) => r.bookings)) },
        ],
        chart: rows.some((r) => r.entries) ? { kind: "bar", title: "Entries by form", categoryKey: "form", valueKey: "entries", valueLabel: "Entries", data: rows.filter((r) => r.entries) } : null,
        note: rows.length ? (d.period ? "Views are all-time totals; entries are for the chosen period." : null) : "No lead forms yet.",
      }
    },
  },
  {
    id: "landing-pages",
    group: "Forms & pages",
    title: "Landing page conversion",
    description: "Visits, enquiries and conversion for each landing page, and how many enquiries book.",
    icon: "pages-line",
    filters: ["period", "project", "campaign"],
    async load(ctx, values) {
      const d = await data(ctx, values)
      const rows = d.pages
        .map((p) => {
          const own = d.leads.filter((l) => l.landingPageId === p.id)
          return {
            id: p.code,
            page: p.name,
            address: `/${p.slug}`,
            campaign: p.campaignId ? d.campaignName(p.campaignId) : "—",
            status: p.status === "published" ? "Published" : "Draft",
            views: Number(p.views ?? 0),
            entries: own.length,
            conversion: pct(own.length, Number(p.views ?? 0)),
            bookings: own.filter((l) => l.booked).length,
          }
        })
        .sort((a, b) => b.views - a.views)
      return {
        columns: [
          { key: "page", header: "Page", width: 24 },
          { key: "address", header: "Address", width: 22 },
          { key: "campaign", header: "Campaign", width: 22 },
          { key: "status", header: "Status", width: 10 },
          { key: "views", header: "Visits", type: "number", width: 10 },
          { key: "entries", header: "Enquiries", type: "number", width: 10 },
          { key: "conversion", header: "Conversion", type: "pct", width: 10 },
          { key: "bookings", header: "Bookings", type: "number", width: 10 },
        ],
        rows,
        summary: [
          { label: "Pages", value: number(rows.length) },
          { label: "Visits", value: number(sum(rows, (r) => r.views)) },
          { label: "Enquiries", value: number(sum(rows, (r) => r.entries)) },
          { label: "Bookings", value: number(sum(rows, (r) => r.bookings)) },
        ],
        chart: rows.some((r) => r.views) ? { kind: "bar", title: "Visits by page", categoryKey: "page", valueKey: "views", valueLabel: "Visits", data: rows.filter((r) => r.views) } : null,
        note: rows.length ? (d.period ? "Visits are all-time totals; enquiries are for the chosen period." : null) : "No landing pages yet.",
      }
    },
  },
]

export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null

// What the browser needs to list reports (no functions)
export const reportMeta = (r) => ({ id: r.id, group: r.group, title: r.title, description: r.description, icon: r.icon, filters: r.filters ?? [] })

// Filter choices: period, projects and campaigns by their lowercased code
export async function reportFilters(ctx) {
  const [projects, campaigns] = await Promise.all([live(ctx.db, "projects").orderBy("name").select("code", "name"), live(ctx.db, "campaigns").orderBy("startDate", "desc").select("code", "name")])
  return {
    period: { label: "Period", all: "All time", options: Object.entries(PERIODS).map(([value, label]) => ({ value, label })) },
    project: { label: "Project", all: "All projects", options: projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name })) },
    campaign: { label: "Campaign", all: "All campaigns", options: campaigns.map((c) => ({ value: c.code.toLowerCase(), label: c.name })) },
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
