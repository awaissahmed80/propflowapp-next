import "server-only"
import { OPEN_STEPS } from "../constants"
import { listLeads } from "./queries"
import { crmSettings } from "./settings"

// CRM Overview: the numbers for the dashboard, from the leads this person may see (so an agent
// sees their own pipeline, a manager their team's). Dates are Pakistan time.
const DAY = 86_400_000
const pkDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d)
const startOfPkDay = (d) => new Date(`${pkDay(d)}T00:00:00+05:00`)

export async function crmOverview(ctx) {
  const [all, rules] = await Promise.all([listLeads(ctx), crmSettings(ctx.db)])
  const now = new Date()
  const today = startOfPkDay(now)
  const endOfToday = new Date(today.getTime() + DAY - 1)
  const monthStart = new Date(`${pkDay(now).slice(0, 7)}-01T00:00:00+05:00`)
  const lastMonthStart = new Date(monthStart)
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1)
  const sameDayLastMonth = new Date(now)
  sameDayLastMonth.setUTCMonth(sameDayLastMonth.getUTCMonth() - 1)
  const t = (d) => (d ? new Date(d).getTime() : null)

  const leads = all.filter((l) => !l.archivedAt)
  const open = leads.filter((l) => OPEN_STEPS.includes(l.status))
  const due = open.filter((l) => l.next && t(l.next.at) <= endOfToday.getTime()).sort((a, b) => t(a.next.at) - t(b.next.at))
  const overdue = due.filter((l) => t(l.next.at) < now.getTime())
  const inRange = (d, from, to = now) => d && t(d) >= from.getTime() && t(d) <= to.getTime()

  const newThisMonth = leads.filter((l) => inRange(l.createdAt, monthStart)).length
  // Last month up to the same day, so early in the month isn't compared with a whole month
  const newLastMonth = leads.filter((l) => inRange(l.createdAt, lastMonthStart, sameDayLastMonth)).length
  const bookedThisMonth = leads.filter((l) => l.status === "booked" && inRange(l.closedAt, monthStart)).length
  const ninety = new Date(now.getTime() - 90 * DAY)
  const closed90 = leads.filter((l) => ["booked", "lost"].includes(l.status) && inRange(l.closedAt, ninety))
  const won90 = closed90.filter((l) => l.status === "booked").length

  // First response: hours from enquiry to the first time someone reached them (last 30 days)
  const responded = leads.filter((l) => l.firstContactAt && inRange(l.createdAt, new Date(now.getTime() - 30 * DAY)))
  const hours = responded.map((l) => (t(l.firstContactAt) - t(l.createdAt)) / 3_600_000).sort((a, b) => a - b)
  const medianHours = hours.length ? hours[Math.floor(hours.length / 2)] : null
  const untouched = open.filter((l) => l.status === "new" && !l.lastContactAt).length

  const stale = rules.stale ? open.filter((l) => now.getTime() - t(l.lastContactAt ?? l.createdAt) > rules.staleDays * DAY).length : null

  // New leads per week, last 12 weeks (weeks start on Monday)
  const monday = new Date(today.getTime() - ((new Date(today.getTime() + 5 * 3_600_000).getUTCDay() + 6) % 7) * DAY)
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const from = new Date(monday.getTime() - (11 - i) * 7 * DAY)
    const to = new Date(from.getTime() + 7 * DAY - 1)
    return { from: pkDay(from), count: leads.filter((l) => inRange(l.createdAt, from, to)).length, booked: leads.filter((l) => l.status === "booked" && inRange(l.closedAt, from, to)).length }
  })

  // Sources over the last 90 days: how many came, and how many booked
  const bySource = new Map()
  for (const l of leads.filter((x) => inRange(x.createdAt, ninety))) {
    const k = l.source ?? ""
    const s = bySource.get(k) ?? { source: l.source, leads: 0, booked: 0 }
    s.leads++
    if (l.status === "booked") s.booked++
    bySource.set(k, s)
  }

  // Agents (not for people who only see their own leads)
  const agents =
    ctx.scope === "own"
      ? null
      : [
          ...open
            .reduce((m, l) => {
              const k = l.agent?.id ?? 0
              const a = m.get(k) ?? { agent: l.agent, open: 0, due: 0, scoreSum: 0, scored: 0, booked: 0 }
              a.open++
              if (l.next && t(l.next.at) <= endOfToday.getTime()) a.due++
              if (l.score) {
                a.scoreSum += l.score.value
                a.scored++
              }
              return m.set(k, a)
            }, new Map())
            .values(),
        ]
          .map((a) => ({ ...a, booked: leads.filter((l) => (l.agent?.id ?? 0) === (a.agent?.id ?? 0) && l.status === "booked" && inRange(l.closedAt, monthStart)).length }))
          .map(({ scoreSum, scored, ...a }) => ({ ...a, avgScore: scored ? Math.round(scoreSum / scored) : null }))
          .sort((a, b) => b.open - a.open)

  const brief = (l) => ({ code: l.code, name: l.name, status: l.status, priority: l.priority, agent: l.agent, next: l.next, score: l.score, interest: l.interest })
  return {
    scope: ctx.scope,
    total: all.length,
    tiles: {
      open: open.length,
      newThisWeek: leads.filter((l) => inRange(l.createdAt, monday)).length,
      newThisMonth,
      newLastMonth,
      due: due.length,
      overdue: overdue.length,
      bookedThisMonth,
      conversion: closed90.length ? Math.round((won90 / closed90.length) * 100) : null,
      closed90: closed90.length,
      medianHours,
      untouched,
      stale,
      staleDays: rules.staleDays,
    },
    stages: OPEN_STEPS.map((st) => ({ status: st, count: open.filter((l) => l.status === st).length })),
    weeks,
    sources: [...bySource.values()].sort((a, b) => b.leads - a.leads),
    due: due.slice(0, 6).map(brief),
    top: rules.scoring
      ? open
          .filter((l) => l.score)
          .sort((a, b) => b.score.value - a.score.value)
          .slice(0, 6)
          .map(brief)
      : null,
    agents,
  }
}
