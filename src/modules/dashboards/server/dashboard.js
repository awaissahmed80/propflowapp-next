import "server-only"
import { notFound, redirect } from "next/navigation"
import { DASHBOARDS, dashboardByKey } from "../nav"
import { bucketsFor, monthsFor, readFilters, resolvePeriod } from "../filters"
import { dashboardsPage } from "./context"
import { visibleCards, visibleDashboards } from "./cards"
import { arrange, getLayout } from "./layouts"
import { projectList } from "./metrics"

// Everything a dashboard page shows: its cards (each loaded on its own, in parallel; a card that
// fails says so without taking the page down), the filters and the dashboards to rotate through.
export async function loadDashboard(key, query) {
  const def = dashboardByKey(key)
  if (!def) notFound()
  const ctx = await dashboardsPage(def.to, def.feature)
  const filters = readFilters(query)
  const [visible, keys, projects, layout] = await Promise.all([
    visibleCards(ctx, key),
    visibleDashboards(
      ctx,
      DASHBOARDS.map((d) => d.key),
    ),
    projectList(ctx.db),
    getLayout(ctx, key),
  ])
  // Nothing for this person here: their first dashboard that has something, or not found
  if (!visible.length) {
    const first = DASHBOARDS.find((d) => keys.includes(d.key))
    if (first) redirect(first.to)
    notFound()
  }

  const project = filters.project ? (projects.find((p) => p.code.toLowerCase() === filters.project) ?? null) : null
  const period = resolvePeriod(filters)
  const f = { r: period, prev: filters.compare ? period.prev : null, project, months: monthsFor(period, 6), buckets: bucketsFor(period) }
  const monthsSpan = `${f.months[0].label} – ${f.months.at(-1).label}`

  const cards = await Promise.all(
    arrange(visible, layout).map(async ({ card, src, hidden }) => {
      const link = typeof card.link === "function" ? card.link(src) : card.link
      const subtitle = [card.months ? `By month, ${monthsSpan}` : card.period ? period.span : "Today", project && !card.project ? "whole business" : null].filter(Boolean).join(" · ")
      const base = { key: card.key, title: card.title, size: card.size, subtitle, link, compares: Boolean(card.period && f.prev) }
      if (hidden) return { ...base, hidden: true }
      try {
        return { ...base, view: await card.load({ src, f }) }
      } catch (err) {
        console.error(`Dashboard card ${card.key} failed:`, err)
        return { ...base, error: true }
      }
    }),
  )

  return {
    dashboard: { key: def.key, label: def.label, description: def.description, to: def.to },
    dashboards: DASHBOARDS.filter((d) => keys.includes(d.key)).map((d) => ({ key: d.key, label: d.label, to: d.to })),
    cards,
    customized: Boolean(layout),
    filters: { ...filters, project: project ? filters.project : null },
    period: { label: period.label, span: period.span, prev: f.prev ? period.prev.span : null },
    projects: projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name })),
    tenant: ctx.tenant.name,
  }
}
