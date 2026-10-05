import "server-only"
import { getLookups } from "@/modules/lookups/server"
import { vizColor } from "@/lib/chart-colors"
import { formatPkr } from "@/lib/format"
import { PROJECT_COLORS, LAND_UNITS } from "@/modules/portfolio/constants"
import * as m from "./metrics"

// Every card on every dashboard. A card shows only when the person can open its source app in
// this workspace (Dashboards' source(), which also checks the plan), the app has the feature the
// card needs, and their role has the grant (e.g. hr.salaries for pay). A dashboard with no card
// left is hidden.
//   key        stable id (saved in people's layouts)
//   dashboard  executive | sales | finance | inventory | after-sales | people
//   size       tile (a headline number) | card | wide (two columns)
//   app        the source app; feature / grant: what it needs there; available(src): any other check
//   period     true: works over the period (and compares); false: as of today
//   project    true: follows the Project filter
//   link       { href, label } to the source page or report, or (src) => that
//   load({ src, f, db }) → a view for the browser (see components/card-views.jsx):
//     kpi    { value, previous?, format, good: up|down|neutral, delta: pct|points, hint, icon, tone }
//     hbars  { rows: [{ label, value, color, note? }], format }
//     bars   { data, xKey, series: [{ key, label, color }], format, stacked?, horizontal? }
//     line   { data, xKey, series, format, wholeNumbers? }
//     list   { rows: [{ title, sub, value, tone? }], empty }
//     table  { columns: [{ key, header, format?, align? }], rows, empty }
//   f: { r: the period, prev: the one before (null when not comparing), project, months, buckets }

const APP_NAMES = { crm: "CRM", campaigns: "Campaigns", operations: "Operations", estate: "Estate Management", finance: "Finance", hr: "HR & Payroll", portfolio: "Project Portfolio" }
export const openIn = (app) => `Open in ${APP_NAMES[app]}`

const num = (v) => new Intl.NumberFormat("en-PK").format(v)
const plural = (count, one, many = `${one}s`) => `${num(count)} ${count === 1 ? one : many}`
// Lookup color names → chart colors (hex colors pass through)
const colorOf = (c, fallback = "blue") => (c && String(c).startsWith("#") ? c : vizColor(c ?? fallback))
const projectColor = (p, i) => p.color || PROJECT_COLORS[i % PROJECT_COLORS.length]
const labelOf = (list, value, fallback = value) => list.find((x) => x.value === value)?.label ?? fallback

const kpi = (o) => ({ type: "kpi", format: "pkr", good: "up", delta: "pct", ...o })
// Payroll is paid at the month's end, so this month usually has none yet
const payrollHint = (f, text) => (f.r.from.slice(0, 7) === m.thisMonth() ? "This month's payroll isn't paid yet" : text)
// previous only when comparing
const prevOf = async (f, fn) => (f.prev ? fn(f.prev) : undefined)

export const CARDS = [
  // ------------------------------------------------------------------ Executive
  {
    key: "exec-bookings",
    dashboard: "executive",
    title: "Bookings",
    size: "tile",
    app: "operations",
    period: true,
    project: true,
    link: { href: "/operations/bookings", label: openIn("operations") },
    async load({ src, f }) {
      const data = await m.operationsSales(src)
      const now = m.bookingsIn(data, f.r, f.project)
      return kpi({ icon: "hand-coin-line", value: now.value, previous: await prevOf(f, (p) => m.bookingsIn(data, p, f.project).value), hint: plural(now.count, "booking") })
    },
  },
  {
    key: "exec-collected",
    dashboard: "executive",
    title: "Collections",
    size: "tile",
    app: "operations",
    period: true,
    project: true,
    link: { href: "/operations/receipts", label: openIn("operations") },
    async load({ src, f }) {
      const data = await m.operationsSales(src)
      return kpi({ icon: "money-dollar-circle-line", tone: "green", value: m.collectedIn(data, f.r, f.project), previous: await prevOf(f, (p) => m.collectedIn(data, p, f.project)), hint: "Buyer payments cleared" })
    },
  },
  {
    key: "exec-cash",
    dashboard: "executive",
    title: "Cash & bank",
    size: "tile",
    app: "finance",
    period: true,
    project: false,
    link: { href: "/finance/banks", label: openIn("finance") },
    async load({ src, f }) {
      const now = await m.cashOn(src, f.r.to)
      return kpi({
        icon: "bank-line",
        tone: "sky",
        value: now.total,
        previous: await prevOf(f, async (p) => (await m.cashOn(src, p.to)).total),
        hint: `At the end of the period · ${plural(now.accounts.length, "account")}`,
      })
    },
  },
  {
    key: "exec-receivable",
    dashboard: "executive",
    title: "Receivable from buyers",
    size: "tile",
    app: "operations",
    period: false,
    project: true,
    link: (src) => ({ href: src.has("installments") ? "/operations/installments" : "/operations/bookings", label: openIn("operations") }),
    async load({ src, f }) {
      const now = m.receivablesNow(await m.operationsSales(src), f.project)
      return kpi({ icon: "wallet-3-line", value: now.receivable, hint: now.overdue ? `${formatPkr(now.overdue)} of it overdue` : "Nothing overdue" })
    },
  },
  {
    key: "exec-overdue",
    dashboard: "executive",
    title: "Overdue",
    size: "tile",
    app: "operations",
    period: false,
    project: true,
    link: (src) => ({ href: src.has("installments") ? "/operations/installments" : "/operations/bookings", label: openIn("operations") }),
    async load({ src, f }) {
      const now = m.receivablesNow(await m.operationsSales(src), f.project)
      return kpi({ icon: "alarm-warning-line", tone: now.overdue ? "red" : "green", value: now.overdue, hint: `${plural(now.overdueBuyers, "buyer")} · ${plural(now.defaulters, "defaulter")}` })
    },
  },
  {
    key: "exec-stock",
    dashboard: "executive",
    title: "Available stock",
    size: "tile",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/inventory", label: openIn("portfolio") },
    async load({ src, f }) {
      const now = m.stockNow(await m.inventoryData(src), f.project)
      return kpi({ icon: "community-line", tone: "violet", value: now.availableValue, hint: `${plural(now.available, "unit")} for sale · ${now.soldPct ?? 0}% sold` })
    },
  },
  {
    key: "exec-leads",
    dashboard: "executive",
    title: "New leads",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: { href: "/crm/leads", label: openIn("crm") },
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      return kpi({
        icon: "user-star-line",
        format: "count",
        value: m.leadsIn(leads, f.r, f.project),
        previous: await prevOf(f, (p) => m.leadsIn(leads, p, f.project)),
        hint: `${num(m.leadsBookedIn(leads, f.r, f.project))} booked in the period`,
      })
    },
  },
  {
    key: "exec-conversion",
    dashboard: "executive",
    title: "Lead conversion",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: (src) => ({ href: src.has("reports") ? "/crm/reports/sources" : "/crm", label: openIn("crm") }),
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      const now = m.conversionIn(leads, f.r, f.project)
      return kpi({
        icon: "percent-line",
        format: "pct",
        delta: "points",
        value: now.pct,
        previous: await prevOf(f, (p) => m.conversionIn(leads, p, f.project).pct),
        hint: `Of ${plural(now.closed, "lead")} closed (booked or lost)`,
      })
    },
  },
  {
    key: "exec-requests",
    dashboard: "executive",
    title: "Open after-sales requests",
    size: "tile",
    app: "estate",
    period: false,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const now = m.requestsNow(await m.estateRequests(src), f.project)
      return kpi({ icon: "home-gear-line", tone: now.overdue ? "amber" : "primary", format: "count", value: now.open, hint: now.overdue ? `${num(now.overdue)} overdue` : "None overdue" })
    },
  },
  {
    key: "exec-headcount",
    dashboard: "executive",
    title: "Headcount",
    size: "tile",
    app: "hr",
    period: false,
    project: true,
    link: { href: "/hrm/employees", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      return kpi({ icon: "team-line", tone: "violet", format: "count", value: m.headcount(emps, f.project), hint: `${num(m.joinedIn(emps, f.r, f.project))} joined in the period` })
    },
  },
  {
    key: "exec-payroll",
    dashboard: "executive",
    title: "Payroll cost",
    size: "tile",
    app: "hr",
    feature: "payroll",
    grant: "hr.salaries",
    period: true,
    project: true,
    link: { href: "/hrm/payroll", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      return kpi({
        icon: "money-rupee-circle-line",
        good: "neutral",
        value: await m.payrollIn(src, emps, f.r, f.project),
        previous: await prevOf(f, (p) => m.payrollIn(src, emps, p, f.project)),
        hint: payrollHint(f, "Paid runs for the months in the period"),
      })
    },
  },
  {
    key: "exec-trend",
    dashboard: "executive",
    title: "Booked and collected by month",
    size: "wide",
    app: "operations",
    period: true,
    project: true,
    months: true,
    link: { href: "/operations/reports", label: openIn("operations") },
    async load({ src, f }) {
      const data = await m.operationsSales(src)
      return {
        type: "bars",
        xKey: "month",
        format: "pkr",
        data: m.salesByMonth(data, f.months, f.project),
        series: [
          { key: "booked", label: "Booked value", color: vizColor("blue") },
          { key: "collected", label: "Collected", color: vizColor("green") },
        ],
      }
    },
  },
  {
    key: "exec-sold",
    dashboard: "executive",
    title: "Sold by project",
    size: "card",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/projects", label: openIn("portfolio") },
    async load({ src, f }) {
      const data = await m.inventoryData(src)
      const all = data.projects.map((p) => p.code)
      return {
        type: "hbars",
        format: "pct",
        max: 100,
        rows: m.byProject(data, f.project).map((p) => ({ label: p.name, value: p.soldPct ?? 0, color: projectColor(p, all.indexOf(p.code)), note: `${num(p.booked + p.sold)} of ${num(p.total)}` })),
        empty: "No units yet.",
      }
    },
  },

  // ------------------------------------------------------------------ Sales & marketing
  {
    key: "sales-leads",
    dashboard: "sales",
    title: "New leads",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: { href: "/crm/leads", label: openIn("crm") },
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      return kpi({ icon: "user-add-line", format: "count", value: m.leadsIn(leads, f.r, f.project), previous: await prevOf(f, (p) => m.leadsIn(leads, p, f.project)), hint: "Enquiries that came in" })
    },
  },
  {
    key: "sales-won",
    dashboard: "sales",
    title: "Leads booked",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: { href: "/crm/leads", label: openIn("crm") },
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      return kpi({
        icon: "checkbox-circle-line",
        tone: "green",
        format: "count",
        value: m.leadsBookedIn(leads, f.r, f.project),
        previous: await prevOf(f, (p) => m.leadsBookedIn(leads, p, f.project)),
        hint: "Closed as booked",
      })
    },
  },
  {
    key: "sales-conversion",
    dashboard: "sales",
    title: "Conversion",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: (src) => ({ href: src.has("reports") ? "/crm/reports/sources" : "/crm", label: openIn("crm") }),
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      const now = m.conversionIn(leads, f.r, f.project)
      return kpi({ icon: "percent-line", format: "pct", delta: "points", value: now.pct, previous: await prevOf(f, (p) => m.conversionIn(leads, p, f.project).pct), hint: `Of ${plural(now.closed, "lead")} closed` })
    },
  },
  {
    key: "sales-response",
    dashboard: "sales",
    title: "First response",
    size: "tile",
    app: "crm",
    period: true,
    project: true,
    link: (src) => ({ href: src.has("reports") ? "/crm/reports/response" : "/crm", label: openIn("crm") }),
    async load({ src, f }) {
      const leads = await m.crmLeads(src)
      return kpi({
        icon: "timer-flash-line",
        tone: "amber",
        format: "hours",
        good: "down",
        value: m.responseHours(leads, f.r, f.project),
        previous: await prevOf(f, (p) => m.responseHours(leads, p, f.project)),
        hint: "Median time to first contact",
      })
    },
  },
  {
    key: "sales-bookings",
    dashboard: "sales",
    title: "Bookings",
    size: "tile",
    app: "operations",
    period: true,
    project: true,
    link: { href: "/operations/bookings", label: openIn("operations") },
    async load({ src, f }) {
      const data = await m.operationsSales(src)
      const now = m.bookingsIn(data, f.r, f.project)
      return kpi({ icon: "hand-coin-line", value: now.value, previous: await prevOf(f, (p) => m.bookingsIn(data, p, f.project).value), hint: plural(now.count, "booking") })
    },
  },
  {
    key: "sales-cpl",
    dashboard: "sales",
    title: "Cost per lead",
    size: "tile",
    app: "campaigns",
    period: true,
    project: true,
    link: { href: "/campaigns/all", label: openIn("campaigns") },
    async load({ src, f }) {
      const act = await m.campaignsData(src)
      const now = m.campaignsIn(act, f.r, f.project)
      return kpi({
        icon: "megaphone-line",
        tone: "violet",
        good: "down",
        value: now.cpl,
        previous: await prevOf(f, (p) => m.campaignsIn(act, p, f.project).cpl),
        hint: now.cpb ? `${formatPkr(now.cpb)} per booking · campaigns running in the period, to date` : "Campaigns running in the period, to date",
      })
    },
  },
  {
    key: "sales-pipeline",
    dashboard: "sales",
    title: "Pipeline by stage",
    size: "card",
    app: "crm",
    period: false,
    project: true,
    link: { href: "/crm/leads", label: openIn("crm") },
    async load({ src, f }) {
      const [leads, lists] = await Promise.all([m.crmLeads(src), getLookups(src.db, ["lead-status"])])
      const rows = m.pipelineNow(leads, f.project)
      return {
        type: "hbars",
        format: "count",
        rows: rows.map((s) => {
          const l = lists["lead-status"].find((x) => x.value === s.status)
          return { label: l?.label ?? s.status, value: s.count, color: colorOf(l?.color) }
        }),
        empty: "No open leads.",
      }
    },
  },
  {
    key: "sales-sources",
    dashboard: "sales",
    title: "Leads by source",
    size: "card",
    app: "crm",
    period: true,
    project: true,
    link: (src) => ({ href: src.has("reports") ? "/crm/reports/sources" : "/crm", label: openIn("crm") }),
    async load({ src, f }) {
      const [leads, lists] = await Promise.all([m.crmLeads(src), getLookups(src.db, ["lead-source", "lead-status"])])
      const rows = m.sourcesIn(leads, f.r, f.project)
      // Eight biggest sources, the rest as Other
      const top = rows.slice(0, 8).map((s) => ({ source: labelOf(lists["lead-source"], s.source, s.source || "Not set"), leads: s.leads, booked: s.booked }))
      const rest = rows.slice(8)
      if (rest.length) top.push({ source: "Other", leads: rest.reduce((s, x) => s + x.leads, 0), booked: rest.reduce((s, x) => s + x.booked, 0) })
      const status = (v) => colorOf(lists["lead-status"].find((x) => x.value === v)?.color)
      return {
        type: "bars",
        horizontal: true,
        xKey: "source",
        format: "count",
        data: top,
        series: [
          { key: "leads", label: "Leads", color: status("new") },
          { key: "booked", label: "Booked", color: status("booked") },
        ],
        empty: "No leads came in during the period.",
      }
    },
  },
  {
    key: "sales-trend",
    dashboard: "sales",
    title: "Leads and bookings over time",
    size: "wide",
    app: "crm",
    period: true,
    project: true,
    link: { href: "/crm", label: openIn("crm") },
    async load({ src, f }) {
      const [leads, lists] = await Promise.all([m.crmLeads(src), getLookups(src.db, ["lead-status"])])
      const status = (v) => colorOf(lists["lead-status"].find((x) => x.value === v)?.color)
      return {
        type: "line",
        xKey: "label",
        format: "count",
        wholeNumbers: true,
        data: m.leadTrend(leads, f.buckets.buckets, f.project),
        series: [
          { key: "leads", label: "New leads", color: status("new") },
          { key: "booked", label: "Booked", color: status("booked") },
        ],
        note: `By ${f.buckets.unit}`,
      }
    },
  },
  {
    key: "sales-by-project",
    dashboard: "sales",
    title: "Booked value by project",
    size: "card",
    app: "operations",
    period: true,
    project: true,
    link: { href: "/operations/bookings", label: openIn("operations") },
    async load({ src, f }) {
      const [data, projects] = await Promise.all([m.operationsSales(src), m.projectList(src.db)])
      return {
        type: "hbars",
        format: "pkr",
        rows: projects
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => !f.project || p.id === f.project.id)
          .map(({ p, i }) => {
            const b = m.bookingsIn(data, f.r, p)
            return { label: p.name, value: b.value, color: projectColor(p, i), note: plural(b.count, "booking") }
          })
          .filter((x) => x.value > 0),
        empty: "No bookings in the period.",
      }
    },
  },
  {
    key: "sales-campaigns",
    dashboard: "sales",
    title: "Campaigns",
    size: "wide",
    app: "campaigns",
    period: true,
    project: true,
    link: (src) => ({ href: "/campaigns/reports", label: openIn("campaigns") }),
    async load({ src, f }) {
      const now = m.campaignsIn(await m.campaignsData(src), f.r, f.project)
      return {
        type: "table",
        columns: [
          { key: "name", header: "Campaign" },
          { key: "leads", header: "Leads", format: "count", align: "right" },
          { key: "booked", header: "Booked", format: "count", align: "right" },
          { key: "spend", header: "Spend to date", format: "pkr", align: "right" },
          { key: "cpl", header: "Per lead", format: "pkr", align: "right" },
          { key: "cpb", header: "Per booking", format: "pkr", align: "right" },
        ],
        rows: now.rows.slice(0, 8).map((c) => ({ id: c.code, name: c.project ? `${c.name} · ${c.project}` : c.name, leads: c.leads, booked: c.booked, spend: c.spend, cpl: c.cpl, cpb: c.cpb })),
        empty: "No campaigns ran during the period.",
        note: "Leads and bookings: from leads that came in during the period. Spend and costs: each campaign to date.",
      }
    },
  },

  // ------------------------------------------------------------------ Collections & finance
  {
    key: "fin-collected",
    dashboard: "finance",
    title: "Collected",
    size: "tile",
    app: "finance",
    feature: "collections",
    period: true,
    project: true,
    link: { href: "/finance/receipts", label: openIn("finance") },
    async load({ src, f }) {
      const data = await m.booksSales(src)
      return kpi({ icon: "money-dollar-circle-line", tone: "green", value: m.collectedIn(data, f.r, f.project), previous: await prevOf(f, (p) => m.collectedIn(data, p, f.project)), hint: "Buyer payments cleared" })
    },
  },
  {
    key: "fin-cash",
    dashboard: "finance",
    title: "Cash & bank",
    size: "tile",
    app: "finance",
    period: true,
    project: false,
    link: { href: "/finance/banks", label: openIn("finance") },
    async load({ src, f }) {
      const now = await m.cashOn(src, f.r.to)
      return kpi({ icon: "bank-line", tone: "sky", value: now.total, previous: await prevOf(f, async (p) => (await m.cashOn(src, p.to)).total), hint: "At the end of the period" })
    },
  },
  {
    key: "fin-receivable",
    dashboard: "finance",
    title: "Receivable from buyers",
    size: "tile",
    app: "finance",
    feature: "collections",
    period: false,
    project: true,
    link: { href: "/finance/reports/receivables-aging", label: openIn("finance") },
    async load({ src, f }) {
      const now = m.receivablesNow(await m.booksSales(src), f.project)
      return kpi({ icon: "wallet-3-line", value: now.receivable, hint: `${formatPkr(now.overdue)} overdue · ${plural(now.defaulters, "defaulter")}` })
    },
  },
  {
    key: "fin-clearing",
    dashboard: "finance",
    title: "Cheques in clearing",
    size: "tile",
    app: "finance",
    feature: "banking",
    period: false,
    project: true,
    link: { href: "/finance/cheques", label: openIn("finance") },
    async load({ src, f }) {
      const now = m.receivablesNow(await m.booksSales(src), f.project)
      return kpi({ icon: "bank-card-2-line", tone: "amber", value: now.clearing, hint: now.clearingCount ? `${plural(now.clearingCount, "cheque or pay order", "cheques and pay orders")}` : "None waiting" })
    },
  },
  {
    key: "fin-net",
    dashboard: "finance",
    title: "Net profit",
    size: "tile",
    app: "finance",
    period: true,
    project: true,
    link: { href: "/finance/reports/profit-loss", label: openIn("finance") },
    async load({ src, f }) {
      const now = await m.profitAndLoss(src, f.r, f.project)
      return kpi({
        icon: "line-chart-line",
        tone: now.net < 0 ? "red" : "green",
        value: now.net,
        previous: await prevOf(f, async (p) => (await m.profitAndLoss(src, p, f.project)).net),
        hint: `${formatPkr(now.income)} income`,
      })
    },
  },
  {
    key: "fin-tax",
    dashboard: "finance",
    title: "Income tax withheld",
    size: "tile",
    app: "finance",
    period: true,
    project: true,
    link: { href: "/finance/reports/tax-withheld", label: openIn("finance") },
    async load({ src, f }) {
      return kpi({
        icon: "government-line",
        tone: "violet",
        good: "neutral",
        value: await m.taxWithheld(src, f.r, f.project),
        previous: await prevOf(f, (p) => m.taxWithheld(src, p, f.project)),
        hint: "To deposit with FBR",
      })
    },
  },
  {
    key: "fin-collected-booked",
    dashboard: "finance",
    title: "Collected vs booked, by month",
    size: "wide",
    app: "finance",
    feature: "collections",
    period: true,
    project: true,
    months: true,
    link: { href: "/finance/reports/collections", label: openIn("finance") },
    async load({ src, f }) {
      const data = await m.booksSales(src)
      return {
        type: "bars",
        xKey: "month",
        format: "pkr",
        data: m.salesByMonth(data, f.months, f.project),
        series: [
          { key: "booked", label: "Booked value", color: vizColor("blue") },
          { key: "collected", label: "Collected", color: vizColor("green") },
        ],
      }
    },
  },
  {
    key: "fin-aging",
    dashboard: "finance",
    title: "Receivables aging",
    size: "card",
    app: "finance",
    period: false,
    project: true,
    link: { href: "/finance/reports/receivables-aging", label: openIn("finance") },
    async load({ src, f }) {
      const aging = await m.receivablesAging(src, f.project)
      return {
        type: "hbars",
        format: "pkr",
        rows: aging.buckets.map((b) => ({ label: b.bucket, value: b.amount, color: vizColor("blue") })),
        empty: "No buyer owes anything on an open booking.",
        note: aging.buyers ? `${formatPkr(aging.owed)} owed by ${plural(aging.buyers, "buyer")}` : null,
      }
    },
  },
  {
    key: "fin-defaulters",
    dashboard: "finance",
    title: "Most overdue buyers",
    size: "card",
    app: "finance",
    feature: "collections",
    period: false,
    project: true,
    link: { href: "/finance/reports/receivables-aging", label: openIn("finance") },
    async load({ src, f }) {
      const rows = m.mostOverdue(await m.booksSales(src), f.project)
      return {
        type: "list",
        rows: rows.map((b) => ({
          title: b.buyer ?? b.code,
          sub: [b.code, b.unit ? `Unit ${b.unit}` : null, b.status === "defaulter" ? "Defaulter" : `${plural(b.overdueCount, "installment")} late`].filter(Boolean).join(" · "),
          value: formatPkr(b.overdue),
          tone: b.status === "defaulter" ? "red" : "amber",
          icon: b.status === "defaulter" ? "error-warning-line" : "time-line",
        })),
        empty: "No buyer is behind on payments.",
      }
    },
  },
  {
    key: "fin-flow",
    dashboard: "finance",
    title: "Money in and out",
    size: "wide",
    app: "finance",
    period: true,
    project: true,
    months: true,
    link: { href: "/finance/reports/cash-book", label: openIn("finance") },
    async load({ src, f }) {
      return {
        type: "bars",
        xKey: "month",
        format: "pkr",
        data: await m.moneyFlow(src, f.months, f.project),
        series: [
          { key: "in", label: "Money in", color: vizColor("blue") },
          { key: "out", label: "Money out", color: vizColor("amber") },
        ],
        note: "Cash and bank only. Transfers between your own accounts are left out.",
      }
    },
  },
  {
    key: "fin-pnl",
    dashboard: "finance",
    title: "Profit & loss",
    size: "card",
    app: "finance",
    period: true,
    project: true,
    link: { href: "/finance/reports/profit-loss", label: openIn("finance") },
    async load({ src, f }) {
      const [now, before] = await Promise.all([m.profitAndLoss(src, f.r, f.project), f.prev ? m.profitAndLoss(src, f.prev, f.project) : null])
      const lines = [
        ["income", "Income"],
        ["cos", "Cost of sales"],
        ["gross", "Gross profit", true],
        ["expenses", "Expenses"],
        ["net", now.net < 0 ? "Net loss" : "Net profit", true],
      ]
      return {
        type: "table",
        columns: [{ key: "label", header: "" }, { key: "now", header: "This period", format: "pkr", align: "right" }, ...(before ? [{ key: "before", header: "Previous", format: "pkr", align: "right" }] : [])],
        rows: lines.map(([k, label, strong]) => ({ id: k, label, now: now[k], before: before?.[k], strong })),
      }
    },
  },
  {
    key: "fin-accounts",
    dashboard: "finance",
    title: "Bank & cash balances",
    size: "card",
    app: "finance",
    period: false,
    project: false,
    link: { href: "/finance/banks", label: openIn("finance") },
    async load({ src }) {
      const now = await m.cashOn(src, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()))
      return {
        type: "list",
        rows: now.accounts.map((a) => ({ title: a.name, sub: a.kind === "bank" ? "Bank" : "Cash", value: formatPkr(a.balance), icon: a.kind === "bank" ? "bank-line" : "wallet-3-line" })),
        empty: "No cash or bank accounts yet.",
      }
    },
  },

  // ------------------------------------------------------------------ Projects & inventory
  {
    key: "inv-stock",
    dashboard: "inventory",
    title: "Available stock value",
    size: "tile",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/inventory", label: openIn("portfolio") },
    async load({ src, f }) {
      const now = m.stockNow(await m.inventoryData(src), f.project)
      return kpi({ icon: "price-tag-3-line", tone: "violet", value: now.availableValue, hint: `${plural(now.available, "unit")} for sale` })
    },
  },
  {
    key: "inv-sold",
    dashboard: "inventory",
    title: "Sold",
    size: "tile",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/projects", label: openIn("portfolio") },
    async load({ src, f }) {
      const now = m.stockNow(await m.inventoryData(src), f.project)
      return kpi({ icon: "pie-chart-line", format: "pct", value: now.soldPct, hint: `Booked or sold, of ${plural(now.total, "unit")}` })
    },
  },
  {
    key: "inv-holds",
    dashboard: "inventory",
    title: "On hold",
    size: "tile",
    app: "portfolio",
    period: false,
    project: true,
    link: (src) => ({ href: src.has("reports") ? "/project-portfolio/reports/holds" : "/project-portfolio/inventory", label: openIn("portfolio") }),
    async load({ src, f }) {
      const now = m.stockNow(await m.inventoryData(src), f.project)
      return kpi({
        icon: "lock-line",
        tone: now.expiringSoon ? "amber" : "primary",
        format: "count",
        value: now.onHold,
        hint: now.expiringSoon ? `${num(now.expiringSoon)} ending within 24 hours` : "None ending within 24 hours",
      })
    },
  },
  {
    key: "inv-booked",
    dashboard: "inventory",
    title: "Units booked",
    size: "tile",
    app: "operations",
    period: true,
    project: true,
    link: { href: "/operations/bookings", label: openIn("operations") },
    async load({ src, f }) {
      const data = await m.operationsSales(src)
      const now = m.bookingsIn(data, f.r, f.project)
      return kpi({ icon: "key-2-line", tone: "green", format: "count", value: now.count, previous: await prevOf(f, (p) => m.bookingsIn(data, p, f.project).count), hint: `${formatPkr(now.value)} booked value` })
    },
  },
  {
    key: "inv-status",
    dashboard: "inventory",
    title: "Units by status",
    size: "wide",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/inventory", label: openIn("portfolio") },
    async load({ src, f }) {
      const [data, lists] = await Promise.all([m.inventoryData(src), getLookups(src.db, ["unit-status"])])
      return {
        type: "bars",
        horizontal: true,
        stacked: true,
        xKey: "project",
        format: "count",
        data: m.byProject(data, f.project).map((p) => ({ project: p.name, ...Object.fromEntries(m.UNIT_STATUSES.map((s) => [s, p[s]])) })),
        series: m.UNIT_STATUSES.map((s) => {
          const l = lists["unit-status"].find((x) => x.value === s)
          return { key: s, label: l?.label ?? s, color: colorOf(l?.color, "gray") }
        }),
        empty: "No units yet.",
      }
    },
  },
  {
    key: "inv-projects",
    dashboard: "inventory",
    title: "Projects",
    size: "card",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/projects", label: openIn("portfolio") },
    async load({ src, f }) {
      return {
        type: "table",
        columns: [
          { key: "name", header: "Project" },
          { key: "available", header: "For sale", format: "count", align: "right" },
          { key: "availableValue", header: "Stock value", format: "pkr", align: "right" },
          { key: "soldPct", header: "Sold", format: "pct", align: "right" },
        ],
        rows: m.byProject(await m.inventoryData(src), f.project).map((p) => ({ id: p.code, ...p })),
        empty: "No units yet.",
      }
    },
  },
  {
    key: "inv-holds-list",
    dashboard: "inventory",
    title: "Holds ending soonest",
    size: "card",
    app: "portfolio",
    period: false,
    project: true,
    link: { href: "/project-portfolio/inventory", label: openIn("portfolio") },
    async load({ src, f }) {
      const rows = await m.holdsEnding(await m.inventoryData(src), f.project)
      return {
        type: "list",
        rows: rows.map((u) => ({ title: `${u.project} ${u.number}`, sub: u.by ? `Held by ${u.by}` : "On hold", value: u.expiresAt ? { at: u.expiresAt } : "No end", icon: "lock-line" })),
        empty: "No units on hold.",
      }
    },
  },
  {
    key: "inv-rates",
    dashboard: "inventory",
    title: "Current rates",
    size: "wide",
    app: "portfolio",
    feature: "price-lists",
    period: false,
    project: true,
    link: { href: "/project-portfolio/price-lists", label: openIn("portfolio") },
    async load({ src, f }) {
      const rows = await m.activeRates(src, f.project)
      return {
        type: "table",
        columns: [
          { key: "project", header: "Project" },
          { key: "unit", header: "Unit" },
          { key: "rate", header: "Rate", format: "pkr", align: "right" },
          { key: "per", header: "Per" },
        ],
        rows: rows.slice(0, 12).map((r, i) => ({
          id: String(i),
          project: r.project,
          unit: [r.sizeValue ? `${r.sizeValue} ${r.sizeUnit}` : null, r.type, r.category ? `(${r.category})` : null].filter(Boolean).join(" "),
          rate: r.rate,
          per: LAND_UNITS.includes(r.sizeUnit) ? "marla" : "sq ft",
        })),
        empty: "No active price list.",
        note: rows.length > 12 ? `First 12 of ${rows.length} rates; the price lists have them all.` : null,
      }
    },
  },

  // ------------------------------------------------------------------ After-sales
  {
    key: "as-open",
    dashboard: "after-sales",
    title: "Open requests",
    size: "tile",
    app: "estate",
    period: false,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const now = m.requestsNow(await m.estateRequests(src), f.project)
      return kpi({ icon: "inbox-line", format: "count", value: now.open, hint: "New, in progress or waiting on the customer" })
    },
  },
  {
    key: "as-overdue",
    dashboard: "after-sales",
    title: "Overdue requests",
    size: "tile",
    app: "estate",
    period: false,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const now = m.requestsNow(await m.estateRequests(src), f.project)
      return kpi({ icon: "alarm-warning-line", tone: now.overdue ? "red" : "green", format: "count", value: now.overdue, hint: "Past their due date" })
    },
  },
  {
    key: "as-new",
    dashboard: "after-sales",
    title: "Requests logged",
    size: "tile",
    app: "estate",
    period: true,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const rows = await m.estateRequests(src)
      return kpi({
        icon: "add-box-line",
        format: "count",
        good: "neutral",
        value: m.requestsIn(rows, f.r, f.project),
        previous: await prevOf(f, (p) => m.requestsIn(rows, p, f.project)),
        hint: "From buyers and residents",
      })
    },
  },
  {
    key: "as-ontime",
    dashboard: "after-sales",
    title: "Done on time",
    size: "tile",
    app: "estate",
    period: true,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const rows = await m.estateRequests(src)
      const now = m.onTimeIn(rows, f.r, f.project)
      return kpi({
        icon: "time-line",
        tone: "green",
        format: "pct",
        delta: "points",
        value: now.pct,
        previous: await prevOf(f, (p) => m.onTimeIn(rows, p, f.project).pct),
        hint: `Of ${plural(now.done, "request")} completed`,
      })
    },
  },
  {
    key: "as-types",
    dashboard: "after-sales",
    title: "Open requests by type",
    size: "card",
    app: "estate",
    period: false,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const [rows, lists] = await Promise.all([m.estateRequests(src), getLookups(src.db, ["service-request-type"])])
      return {
        type: "hbars",
        format: "count",
        rows: m.openByType(rows, f.project).map((t) => {
          const l = lists["service-request-type"].find((x) => x.value === t.type)
          return { label: l?.label ?? t.type, value: t.count, color: colorOf(l?.color) }
        }),
        empty: "No open requests.",
      }
    },
  },
  {
    key: "as-pipeline",
    dashboard: "after-sales",
    title: "Transfers, NDC and possession",
    size: "wide",
    app: "estate",
    period: true,
    project: true,
    available: (src) => m.PIPELINE_TYPES.some((t) => m.typeAllowed(src, t)),
    link: (src) => ({ href: src.has("transfers") ? "/estate-management/transfers" : "/estate-management/ndc", label: openIn("estate") }),
    async load({ src, f }) {
      const [rows, lists] = await Promise.all([m.estateRequests(src), getLookups(src.db, ["service-request-type", "service-status"])])
      const status = (v) => lists["service-status"].find((x) => x.value === v)
      return {
        type: "bars",
        horizontal: true,
        stacked: true,
        xKey: "type",
        format: "count",
        data: m.papersPipeline(src, rows, f.r, f.project).map((p) => ({ ...p, type: labelOf(lists["service-request-type"], p.type) })),
        series: m.PIPELINE_STEPS.map((s) => ({ key: s, label: s === "completed" ? `${status(s)?.label ?? "Done"} in the period` : (status(s)?.label ?? s), color: colorOf(status(s)?.color) })),
        note: "Open ones by where they are now, and those completed during the period.",
      }
    },
  },
  {
    key: "as-complaints",
    dashboard: "after-sales",
    title: "Complaints by category",
    size: "card",
    app: "estate",
    feature: "complaints",
    period: true,
    project: true,
    link: { href: "/estate-management/complaints", label: openIn("estate") },
    async load({ src, f }) {
      const [rows, lists] = await Promise.all([m.estateRequests(src), getLookups(src.db, ["complaint-category"])])
      const now = m.complaintsIn(rows, f.r, f.project)
      const urgent = m.requestsNow(rows, f.project).urgent
      return {
        type: "hbars",
        format: "count",
        rows: now.byCategory.map((c) => ({ label: labelOf(lists["complaint-category"], c.category, "Other"), value: c.count, color: vizColor("amber") })),
        empty: "No complaints in the period.",
        note: `${plural(now.total, "complaint")} in the period · ${num(urgent)} urgent or high still open`,
      }
    },
  },
  {
    key: "as-overdue-list",
    dashboard: "after-sales",
    title: "Overdue requests",
    size: "card",
    app: "estate",
    period: false,
    project: true,
    link: { href: "/estate-management/requests", label: openIn("estate") },
    async load({ src, f }) {
      const [rows, lists] = await Promise.all([m.estateRequests(src), getLookups(src.db, ["service-request-type"])])
      return {
        type: "list",
        rows: m.overdueRequests(rows, f.project).map((x) => ({
          title: x.subject || labelOf(lists["service-request-type"], x.type),
          sub: [x.code, labelOf(lists["service-request-type"], x.type), x.unit ? `Unit ${x.unit}` : null].filter(Boolean).join(" · "),
          value: { due: x.dueAt },
          tone: "red",
          icon: "alarm-warning-line",
          href: `/estate-management/requests/${String(x.code).toLowerCase()}`,
        })),
        empty: "Nothing overdue.",
      }
    },
  },

  // ------------------------------------------------------------------ People
  {
    key: "ppl-headcount",
    dashboard: "people",
    title: "Headcount",
    size: "tile",
    app: "hr",
    period: false,
    project: true,
    link: { href: "/hrm/employees", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      return kpi({ icon: "team-line", tone: "violet", format: "count", value: m.headcount(emps, f.project), hint: `${num(m.joinedIn(emps, f.r, f.project))} joined in the period` })
    },
  },
  {
    key: "ppl-away",
    dashboard: "people",
    title: "Away today",
    size: "tile",
    app: "hr",
    feature: "leave",
    period: false,
    project: true,
    link: { href: "/hrm/leave", label: openIn("hr") },
    async load({ src, f }) {
      const away = await m.awayToday(src, await m.hrEmployees(src), f.project)
      return kpi({ icon: "plane-line", tone: "sky", format: "count", value: away.length, hint: "On approved leave" })
    },
  },
  {
    key: "ppl-leave",
    dashboard: "people",
    title: "Leave waiting",
    size: "tile",
    app: "hr",
    feature: "leave",
    period: false,
    project: true,
    link: { href: "/hrm/leave", label: openIn("hr") },
    async load({ src, f }) {
      const waiting = await m.leaveWaiting(src, await m.hrEmployees(src), f.project)
      return kpi({ icon: "calendar-check-line", tone: waiting ? "amber" : "primary", format: "count", value: waiting, hint: "Requests to approve" })
    },
  },
  {
    key: "ppl-attendance",
    dashboard: "people",
    title: "Attendance on time",
    size: "tile",
    app: "hr",
    feature: "attendance",
    period: true,
    project: true,
    link: { href: "/hrm/reports/attendance-summary", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      const now = await m.attendanceIn(src, emps, f.r, f.project)
      return kpi({
        icon: "fingerprint-line",
        tone: "green",
        format: "pct",
        delta: "points",
        value: now.pct,
        previous: await prevOf(f, async (p) => (await m.attendanceIn(src, emps, p, f.project)).pct),
        hint: now.marked ? `${num(now.late)} late · ${num(now.absent)} absent of ${num(now.marked)} days` : "No attendance marked",
      })
    },
  },
  {
    key: "ppl-payroll",
    dashboard: "people",
    title: "Payroll cost",
    size: "tile",
    app: "hr",
    feature: "payroll",
    grant: "hr.salaries",
    period: true,
    project: true,
    link: { href: "/hrm/payroll", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      return kpi({
        icon: "money-rupee-circle-line",
        good: "neutral",
        value: await m.payrollIn(src, emps, f.r, f.project),
        previous: await prevOf(f, (p) => m.payrollIn(src, emps, p, f.project)),
        hint: payrollHint(f, "Paid runs, with employer's EOBI and PF"),
      })
    },
  },
  {
    key: "ppl-loans",
    dashboard: "people",
    title: "Loans outstanding",
    size: "tile",
    app: "hr",
    feature: "payroll",
    grant: "hr.salaries",
    period: false,
    project: false,
    link: { href: "/hrm/loans", label: openIn("hr") },
    async load({ src }) {
      const now = await m.loansOutstanding(src)
      return kpi({ icon: "hand-coin-line", tone: "amber", value: now.amount, hint: now.count ? `${plural(now.count, "loan or advance", "loans and advances")} being recovered` : "None being recovered" })
    },
  },
  {
    key: "ppl-departments",
    dashboard: "people",
    title: "Headcount by department",
    size: "card",
    app: "hr",
    period: false,
    project: true,
    link: (src) => ({ href: "/hrm/reports/headcount", label: openIn("hr") }),
    async load({ src, f }) {
      const [emps, lists] = await Promise.all([m.hrEmployees(src), getLookups(src.db, ["department"])])
      return {
        type: "hbars",
        format: "count",
        rows: m.byDepartment(emps, f.project).map((d) => ({ label: labelOf(lists.department, d.department, d.department || "No department"), value: d.count, color: vizColor("violet") })),
        empty: "No employees you can see.",
      }
    },
  },
  {
    key: "ppl-payroll-trend",
    dashboard: "people",
    title: "Payroll cost by month",
    size: "wide",
    app: "hr",
    feature: "payroll",
    grant: "hr.salaries",
    period: true,
    project: true,
    months: true,
    link: { href: "/hrm/payroll", label: openIn("hr") },
    async load({ src, f }) {
      const emps = await m.hrEmployees(src)
      return {
        type: "line",
        xKey: "month",
        format: "pkr",
        data: await m.payrollByMonth(src, emps, f.months, f.project),
        series: [{ key: "cost", label: "Payroll cost", color: vizColor("violet") }],
        note: "Paid runs: pay, bonuses and the employer's EOBI and provident fund.",
      }
    },
  },
  {
    key: "ppl-away-list",
    dashboard: "people",
    title: "Who's away",
    size: "card",
    app: "hr",
    feature: "leave",
    period: false,
    project: true,
    link: { href: "/hrm/leave", label: openIn("hr") },
    async load({ src, f }) {
      const [away, lists] = await Promise.all([m.awayToday(src, await m.hrEmployees(src), f.project), getLookups(src.db, ["leave-type"])])
      return {
        type: "list",
        rows: away.map((a) => ({ title: a.name, sub: labelOf(lists["leave-type"], a.type), value: { until: a.until }, icon: "plane-line", href: a.code ? `/hrm/employees/${String(a.code).toLowerCase()}` : null })),
        empty: "Everyone's in today.",
      }
    },
  },
]

export const cardsOf = (dashboard) => CARDS.filter((c) => c.dashboard === dashboard)
export const cardByKey = (key) => CARDS.find((c) => c.key === key) ?? null

// The card's source context when this person may see it, else null
export async function cardSource(ctx, card) {
  if (!ctx.has(card.dashboard)) return null
  const src = await ctx.source(card.app)
  if (!src) return null
  if (card.feature && !src.has(card.feature)) return null
  if (card.grant && !src.grant?.(card.grant)) return null
  if (card.available && !card.available(src)) return null
  return src
}

// The cards of a dashboard this person may see → [{ card, src }]
export async function visibleCards(ctx, dashboard) {
  const list = cardsOf(dashboard)
  const srcs = await Promise.all(list.map((c) => cardSource(ctx, c)))
  return list.map((card, i) => ({ card, src: srcs[i] })).filter((x) => x.src)
}

// Dashboards with at least one card this person may see, in sidebar order
export async function visibleDashboards(ctx, keys) {
  const counts = await Promise.all(keys.map(async (k) => (ctx.has(k) ? (await visibleCards(ctx, k)).length : 0)))
  return keys.filter((_, i) => counts[i] > 0)
}
