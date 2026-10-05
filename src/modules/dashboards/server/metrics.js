import "server-only"
import { cache } from "react"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { ledgerFor } from "@/modules/operations/server/ledger"
import { scoped as salesScoped } from "@/modules/operations/server/context"
import { scoped as crmScoped } from "@/modules/crm/server/context"
import { scoped as estateScoped } from "@/modules/estate/server/context"
import { scoped as hrScoped } from "@/modules/hr/server/context"
import { campaignActivity } from "@/modules/campaigns/server/queries"
import { activeListsByProject } from "@/modules/portfolio/server/price-list-queries"
import { listLoans } from "@/modules/hr/server/employee-queries"
import { isOwner } from "@/modules/hr/constants"
import { OPEN_STATUSES } from "@/modules/estate/constants"
import { ACCOUNTS } from "@/modules/finance/constants"
import { balancesAsOf, bookLines, chartOfAccounts } from "@/modules/finance/server/books"
import { getReport } from "@/modules/finance/server/reports"
import { dayEnd, dayStart, pkDay } from "../filters"

// Period-aware numbers for the dashboards. The apps' own overviews work over fixed windows (the
// last 30 days, six months); these take any period and project, so each figure can be compared
// with the period before. Each app's rows are read once per request through that app's context
// and its scope (an agent's dashboard counts their own leads and bookings), then summed here.
//   r: { from, to } Pakistan days, inclusive · project: { id, code, name } | null (whole business)

const n = (v) => Number(v ?? 0)
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const round = (v) => Math.round(Number(v) * 100) / 100
// Datetime columns → their Pakistan day; DATE columns (read as UTC midnight) → that day
const pk = (d) => (d ? pkDay(d) : null)
const dateOnly = (d) => (!d ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
export const within = (day, r) => Boolean(day) && day >= r.from && day <= r.to
const ofProject = (rows, project, key = "projectId") => (project ? rows.filter((x) => x[key] === project.id) : rows)
export const share = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null)
const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// ---------- projects ----------

export const projectList = cache(async (db) => live(db, "projects").orderBy("sortOrder").orderBy("name").select("id", "code", "name", "color"))

// "ske" → { id, code, name, color } | null
export async function findProject(db, code) {
  if (!code) return null
  return (await projectList(db)).find((p) => p.code.toLowerCase() === code) ?? null
}

// ---------- bookings and payments (Operations, or Finance's whole books) ----------

const OPEN_BOOKING = (b) => !["cancelled", "refunded"].includes(b.status)

async function salesRows(db, scope) {
  const bookings = await scope(db("bookings as b").whereNull("b.deletedAt"))
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .leftJoin("units as u", "u.id", "b.unitId")
    .select("b.id", "b.code", "b.projectId", "b.status", "b.stage", "b.netPrice", "b.agreedPrice", "b.bookedAt", "b.customerName", "c.name as contactName", "u.number as unitNumber")
  const [receipts, money] = await Promise.all([
    scope(db("receipts as r").join("bookings as b", "b.id", "r.bookingId").whereNull("r.deletedAt").whereNull("b.deletedAt")).select("r.amount", "r.status", "r.receivedOn", "r.clearedAt", "b.projectId"),
    ledgerFor(db, bookings),
  ])
  return {
    bookings: bookings.map((b) => ({
      code: b.code,
      projectId: b.projectId,
      status: b.status,
      stage: b.stage,
      buyer: b.contactName ?? b.customerName,
      unit: b.unitNumber,
      net: n(b.netPrice ?? b.agreedPrice),
      day: pk(b.bookedAt),
      balance: money.get(b.id)?.balance ?? 0,
      overdue: money.get(b.id)?.overdueAmount ?? 0,
      overdueCount: money.get(b.id)?.overdueCount ?? 0,
    })),
    // A payment counts on the day it cleared (cash and transfers: the day it came in), as in
    // Finance's collections report
    receipts: receipts.map((x) => ({ amount: n(x.amount), status: x.status, projectId: x.projectId, day: pk(x.clearedAt ?? x.receivedOn) })),
  }
}

// What this person sees in Operations (their scope)
export const operationsSales = cache((ctx) => salesRows(ctx.db, (q) => salesScoped(ctx, q, "b")))
// Every booking (Finance has one set of books, no scope)
export const booksSales = cache((ctx) => salesRows(ctx.db, (q) => q))

// Bookings made in a period (not canceled since) → { count, value }
export function bookingsIn(data, r, project) {
  const list = ofProject(data.bookings, project).filter((b) => OPEN_BOOKING(b) && within(b.day, r))
  return { count: list.length, value: round(sum(list, (b) => b.net)) }
}

// Buyer payments that cleared in a period
export const collectedIn = (data, r, project) =>
  round(
    sum(
      ofProject(data.receipts, project).filter((x) => x.status === "cleared" && within(x.day, r)),
      (x) => x.amount,
    ),
  )

// Today: what buyers still owe, how much is overdue, defaulters and cheques in clearing
export function receivablesNow(data, project) {
  const open = ofProject(data.bookings, project).filter(OPEN_BOOKING)
  const late = open.filter((b) => b.overdue > 0)
  const clearing = ofProject(data.receipts, project).filter((x) => x.status === "clearing")
  return {
    receivable: round(sum(open, (b) => b.balance)),
    overdue: round(sum(late, (b) => b.overdue)),
    overdueBuyers: late.length,
    defaulters: open.filter((b) => b.status === "defaulter").length,
    clearing: round(sum(clearing, (x) => x.amount)),
    clearingCount: clearing.length,
  }
}

// Booked value and collections per month
export const salesByMonth = (data, months, project) => months.map((m) => ({ month: m.label, booked: bookingsIn(data, m, project).value, collected: collectedIn(data, m, project) }))

// Buyers furthest behind, most overdue first
export const mostOverdue = (data, project, limit = 6) =>
  ofProject(data.bookings, project)
    .filter((b) => OPEN_BOOKING(b) && b.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, limit)

// ---------- the books (Finance) ----------

// Cash and bank on a day (end of that day), every active cash or bank account
export async function cashOn(ctx, day) {
  const rows = await balancesAsOf(ctx.db, { asOf: dayEnd(day) })
  const money = rows.filter((a) => ["cash", "bank"].includes(a.kind) && a.isActive !== false)
  return { total: round(sum(money, (a) => a.net)), accounts: money.map((a) => ({ code: a.code, name: a.name, kind: a.kind, balance: a.net })).sort((a, b) => b.balance - a.balance) }
}

// Money in and out of cash and bank per month (transfers between them left out), as Finance's overview
export async function moneyFlow(ctx, months, project) {
  if (!months.length) return []
  const lines = await bookLines(ctx.db, { from: dayStart(months[0].from), to: dayEnd(months.at(-1).to), project: project?.id ?? null })
    .join("accounts as a", "a.id", "l.accountId")
    .select("v.id", "v.voucherDate", "l.debit", "l.credit", "a.kind")
  const vouchers = new Map()
  for (const l of lines) {
    if (!vouchers.has(l.id)) vouchers.set(l.id, { day: pk(l.voucherDate), lines: [] })
    vouchers.get(l.id).lines.push(l)
  }
  const out = months.map((m) => ({ month: m.label, from: m.from, to: m.to, in: 0, out: 0 }))
  for (const v of vouchers.values()) {
    if (v.lines.every((l) => l.kind)) continue
    const bucket = out.find((m) => within(v.day, m))
    if (!bucket) continue
    for (const l of v.lines)
      if (l.kind) {
        bucket.in += n(l.debit)
        bucket.out += n(l.credit)
      }
  }
  return out.map(({ month, in: i, out: o }) => ({ month, in: round(i), out: round(o) }))
}

// What Finance's reports expect as env (books.js / reports.js)
async function reportEnv(ctx, r, project) {
  const [projects, accounts] = await Promise.all([live(ctx.db, "projects").select("id", "code", "name"), chartOfAccounts(ctx.db)])
  return { range: r ? { from: dayStart(r.from), to: dayEnd(r.to) } : { from: null, to: new Date() }, asOf: new Date(), project: project?.id ?? null, projects, accounts }
}

// Profit & loss for a period, from Finance's own report → { income, cos, gross, expenses, net }
export async function profitAndLoss(ctx, r, project) {
  const result = await getReport("profit-loss").load(ctx, { split: "" }, await reportEnv(ctx, r, project))
  const row = (id) => round(result.rows.find((x) => x.id === id)?.amount ?? 0)
  return { income: row("income-total"), cos: row("cos-total"), gross: row("gross"), expenses: row("expenses-total"), net: row("net") }
}

// Receivables aging today, from Finance's report → { buckets: [{ bucket, amount }], buyers, owed }
export async function receivablesAging(ctx, project) {
  const result = await getReport("receivables-aging").load(ctx, {}, await reportEnv(ctx, null, project))
  const rows = result.rows ?? []
  return { buckets: result.chart?.data ?? [], buyers: rows.length, owed: round(sum(rows, (x) => x.total)) }
}

// Income tax withheld (credits to the withholding account) in a period
export async function taxWithheld(ctx, r, project) {
  const wht = await live(ctx.db, "accounts").where({ code: ACCOUNTS.wht }).first("id")
  if (!wht) return 0
  const row = await bookLines(ctx.db, { from: dayStart(r.from), to: dayEnd(r.to), project: project?.id ?? null })
    .where("l.accountId", wht.id)
    .sum({ c: "l.credit" })
    .first()
  return round(row?.c ?? 0)
}

// ---------- leads (CRM) ----------

export const crmLeads = cache(async (ctx) => {
  const rows = await crmScoped(ctx, live(ctx.db, "leads")).select("leads.status", "leads.source", "leads.projectId", "leads.createdAt", "leads.closedAt", "leads.firstContactAt", "leads.archivedAt")
  // Archived leads are left out, as on CRM's overview
  return rows.filter((l) => !l.archivedAt).map((l) => ({ ...l, created: pk(l.createdAt), closed: pk(l.closedAt) }))
})

export const OPEN_LEAD = ["new", "contacted", "interested", "site-visit", "negotiation"]

export const leadsIn = (leads, r, project) => ofProject(leads, project).filter((l) => within(l.created, r)).length
export const leadsBookedIn = (leads, r, project) => ofProject(leads, project).filter((l) => l.status === "booked" && within(l.closed, r)).length

// Leads closed in the period (booked or lost) that were booked, as a percentage
export function conversionIn(leads, r, project) {
  const closed = ofProject(leads, project).filter((l) => ["booked", "lost"].includes(l.status) && within(l.closed, r))
  return { pct: share(closed.filter((l) => l.status === "booked").length, closed.length), closed: closed.length }
}

// Median hours from enquiry to first contact, for leads that came in during the period
export function responseHours(leads, r, project) {
  const hours = ofProject(leads, project)
    .filter((l) => l.firstContactAt && within(l.created, r))
    .map((l) => (new Date(l.firstContactAt) - new Date(l.createdAt)) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b)
  return hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null
}

// Open leads per stage, today
export const pipelineNow = (leads, project) => OPEN_LEAD.map((status) => ({ status, count: ofProject(leads, project).filter((l) => l.status === status).length }))

// Leads that came in per source during the period, with how many have booked
export function sourcesIn(leads, r, project) {
  const by = new Map()
  for (const l of ofProject(leads, project).filter((x) => within(x.created, r))) {
    const s = by.get(l.source ?? "") ?? { source: l.source ?? "", leads: 0, booked: 0 }
    s.leads++
    if (l.status === "booked") s.booked++
    by.set(l.source ?? "", s)
  }
  return [...by.values()].sort((a, b) => b.leads - a.leads)
}

export const leadTrend = (leads, buckets, project) => buckets.map((b) => ({ label: b.label, leads: leadsIn(leads, b, project), booked: leadsBookedIn(leads, b, project) }))

// ---------- campaigns ----------

export const campaignsData = cache((ctx) => campaignActivity(ctx))

// Campaigns that ran during the period (any day of it): leads and bookings from leads that came in
// during the period; spend, cost per lead and per booking to date (spend isn't dated)
export function campaignsIn(act, r, project) {
  const list = act.campaigns.filter((c) => c.status !== "draft" && c.startDate && c.startDate <= r.to && (!c.endDate || c.endDate >= r.from) && (!project || c.project?.code === project.code))
  const rows = list.map((c) => {
    const own = act.leads.filter((l) => l.campaign === c.code && within(pk(l.createdAt), r))
    return {
      code: c.code,
      name: c.name,
      project: c.project?.name ?? null,
      leads: own.length,
      booked: own.filter((l) => l.booked).length,
      spend: c.results.spend,
      cpl: c.results.cpl,
      cpb: c.results.cpb,
      totalLeads: c.results.leads,
      totalBookings: c.results.bookings,
    }
  })
  const spend = sum(rows, (x) => x.spend)
  const totalLeads = sum(rows, (x) => x.totalLeads)
  const totalBookings = sum(rows, (x) => x.totalBookings)
  return {
    rows: rows.sort((a, b) => b.leads - a.leads || b.spend - a.spend),
    spend,
    leads: sum(rows, (x) => x.leads),
    cpl: totalLeads ? Math.round(spend / totalLeads) : null,
    cpb: totalBookings ? Math.round(spend / totalBookings) : null,
  }
}

// ---------- service requests (Estate Management) ----------

// Request types and the Estate feature each needs (the rest come with Service requests)
const TYPE_FEATURE = { transfer: "transfers", ndc: "ndc-possession", possession: "ndc-possession", complaint: "complaints" }
export const typeAllowed = (ctx, type) => !TYPE_FEATURE[type] || ctx.has(TYPE_FEATURE[type])

export const estateRequests = cache(async (ctx) => {
  const rows = await estateScoped(ctx, ctx.db("serviceRequests as r").whereNull("r.deletedAt"), "r")
    .leftJoin("bookings as b", "b.id", "r.bookingId")
    .leftJoin("units as u", "u.id", ctx.db.raw("coalesce(r.unit_id, b.unit_id)"))
    .select("r.code", "r.type", "r.status", "r.priority", "r.subject", "r.data", "r.createdAt", "r.closedAt", "r.dueAt", "u.projectId", "u.number as unitNumber")
  const now = Date.now()
  return rows
    .filter((x) => typeAllowed(ctx, x.type))
    .map((x) => {
      const open = OPEN_STATUSES.includes(x.status)
      return {
        code: x.code,
        type: x.type,
        status: x.status,
        priority: x.priority,
        subject: x.subject,
        unit: x.unitNumber,
        projectId: x.projectId,
        category: json(x.data, {})?.category ?? null,
        open,
        overdue: open && x.dueAt ? new Date(x.dueAt).getTime() < now : false,
        dueAt: x.dueAt,
        created: pk(x.createdAt),
        closed: pk(x.closedAt),
        onTime: x.status === "completed" ? !x.dueAt || !x.closedAt || new Date(x.closedAt) <= new Date(x.dueAt) : null,
      }
    })
})

export function requestsNow(rows, project) {
  const open = ofProject(rows, project).filter((x) => x.open)
  return { open: open.length, overdue: open.filter((x) => x.overdue).length, urgent: open.filter((x) => x.type === "complaint" && ["urgent", "high"].includes(x.priority)).length }
}
export const requestsIn = (rows, r, project) => ofProject(rows, project).filter((x) => within(x.created, r)).length

// Requests completed in the period that were done by their due date, as a percentage
export function onTimeIn(rows, r, project) {
  const done = ofProject(rows, project).filter((x) => x.status === "completed" && within(x.closed, r))
  return { pct: share(done.filter((x) => x.onTime).length, done.length), done: done.length }
}

export function openByType(rows, project) {
  const by = new Map()
  for (const x of ofProject(rows, project).filter((y) => y.open)) by.set(x.type, (by.get(x.type) ?? 0) + 1)
  return [...by].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
}

// Transfers, NDC and possession: open ones by where they are, and those completed in the period
export const PIPELINE_TYPES = ["transfer", "ndc", "possession"]
export const PIPELINE_STEPS = ["new", "in-progress", "awaiting-customer", "completed"]
export function papersPipeline(ctx, rows, r, project) {
  const mine = ofProject(rows, project)
  return PIPELINE_TYPES.filter((t) => typeAllowed(ctx, t)).map((type) => {
    const own = mine.filter((x) => x.type === type)
    return {
      type,
      new: own.filter((x) => x.status === "new").length,
      "in-progress": own.filter((x) => x.status === "in-progress").length,
      "awaiting-customer": own.filter((x) => x.status === "awaiting-customer").length,
      completed: own.filter((x) => x.status === "completed" && within(x.closed, r)).length,
    }
  })
}

export function complaintsIn(rows, r, project) {
  const list = ofProject(rows, project).filter((x) => x.type === "complaint" && within(x.created, r))
  const by = new Map()
  for (const x of list) by.set(x.category ?? "other", (by.get(x.category ?? "other") ?? 0) + 1)
  return { total: list.length, byCategory: [...by].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count) }
}

export const overdueRequests = (rows, project, limit = 6) =>
  ofProject(rows, project)
    .filter((x) => x.overdue)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, limit)

// ---------- people (HR & Payroll) ----------

export const hrEmployees = cache(async (ctx) => {
  const rows = await hrScoped(ctx, live(ctx.db, "employees")).select(
    "employees.id",
    "employees.code",
    "employees.name",
    "employees.department",
    "employees.status",
    "employees.employmentType",
    "employees.joinedOn",
    "employees.projectId",
  )
  return rows.map((e) => ({ ...e, joined: dateOnly(e.joinedOn) }))
})

// Headcount leaves owners and directors out, as HR's overview
const counted = (emps, project) => ofProject(emps, project).filter((e) => e.status === "active" && !isOwner(e.employmentType))
export const headcount = (emps, project) => counted(emps, project).length
export const joinedIn = (emps, r, project) => counted(emps, project).filter((e) => within(e.joined, r)).length

export function byDepartment(emps, project) {
  const by = new Map()
  for (const e of counted(emps, project)) by.set(e.department ?? "", (by.get(e.department ?? "") ?? 0) + 1)
  return [...by].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count)
}

// On approved leave today → [{ code, name, type, backOn }]
export async function awayToday(ctx, emps, project) {
  const list = ofProject(emps, project)
  if (!list.length) return []
  const today = pkDay()
  const rows = await live(ctx.db, "leaveRequests")
    .whereIn(
      "employeeId",
      list.map((e) => e.id),
    )
    .where({ status: "approved" })
    .where("startOn", "<=", today)
    .where("endOn", ">=", today)
    .orderBy("endOn")
    .select("employeeId", "type", "endOn")
  const byId = new Map(list.map((e) => [e.id, e]))
  return rows.map((l) => ({ code: byId.get(l.employeeId)?.code, name: byId.get(l.employeeId)?.name, type: l.type, until: dateOnly(l.endOn) }))
}

export async function leaveWaiting(ctx, emps, project) {
  const list = ofProject(emps, project)
  if (!list.length) return 0
  const row = await live(ctx.db, "leaveRequests")
    .whereIn(
      "employeeId",
      list.map((e) => e.id),
    )
    .where({ status: "pending" })
    .count({ c: "id" })
    .first()
  return n(row?.c)
}

// Days marked present (on time) out of all days marked in the period, as HR's attendance summary
export async function attendanceIn(ctx, emps, r, project) {
  const list = ofProject(emps, project)
  if (!list.length) return { pct: null, marked: 0, late: 0, absent: 0 }
  const rows = await ctx
    .db("attendance")
    .whereIn(
      "employeeId",
      list.map((e) => e.id),
    )
    .whereBetween("onDate", [r.from, r.to])
    .groupBy("status")
    .select("status")
    .count({ c: "*" })
  const c = (s) => n(rows.find((x) => x.status === s)?.c)
  const marked = c("present") + c("late") + c("absent")
  return { pct: share(c("present"), marked), marked, late: c("late"), absent: c("absent") }
}

// Payroll cost (pay + bonus + employer's EOBI and provident fund) of paid runs, per month
export async function payrollByMonth(ctx, emps, months, project) {
  const list = ofProject(emps, project)
  if (!list.length || !months.length) return months.map((m) => ({ month: m.label, key: m.key, cost: 0 }))
  const rows = await ctx
    .db("payrollRuns as r")
    .join("payrollLines as l", "l.runId", "r.id")
    .whereNull("r.deletedAt")
    .where("r.status", "paid")
    .whereBetween("r.month", [months[0].key, months.at(-1).key])
    .whereIn(
      "l.employeeId",
      list.map((e) => e.id),
    )
    .groupBy("r.month")
    .select("r.month")
    .sum({ gross: "l.gross", bonus: "l.bonus", eobiEmployer: "l.eobiEmployer", pfEmployer: "l.pfEmployer" })
  const by = new Map(rows.map((x) => [x.month, round(n(x.gross) + n(x.bonus) + n(x.eobiEmployer) + n(x.pfEmployer))]))
  return months.map((m) => ({ month: m.label, key: m.key, cost: by.get(m.key) ?? 0 }))
}

export const thisMonth = () => pkDay().slice(0, 7)

// Payroll cost for the months a period touches
export async function payrollIn(ctx, emps, r, project) {
  const months = []
  for (let m = r.from.slice(0, 7); m <= r.to.slice(0, 7) && months.length < 40;) {
    months.push({ key: m, label: m })
    const [y, mo] = m.split("-").map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`
  }
  return round(sum(await payrollByMonth(ctx, emps, months, project), (x) => x.cost))
}

// Loans and advances still being recovered (HR's own list, so the same scope)
export async function loansOutstanding(ctx) {
  const active = (await listLoans(ctx)).filter((l) => l.status === "active")
  return { amount: round(sum(active, (l) => l.left)), count: active.length }
}

// ---------- inventory (Project Portfolio) ----------

// Units and projects. Holds that have run out count as available (Project Portfolio releases them
// the next time its pages are opened; dashboards only read).
export const inventoryData = cache(async (ctx) => {
  const [projects, units] = await Promise.all([projectList(ctx.db), live(ctx.db, "units").select("id", "code", "number", "type", "projectId", "status", "price", "holdBy", "holdExpiresAt")])
  const now = Date.now()
  return {
    projects,
    units: units.map((u) => ({
      code: u.code,
      number: u.number,
      type: u.type,
      projectId: u.projectId,
      price: n(u.price),
      holdBy: u.holdBy,
      holdExpiresAt: u.holdExpiresAt,
      status: u.status === "on-hold" && u.holdExpiresAt && new Date(u.holdExpiresAt).getTime() <= now ? "available" : u.status,
    })),
  }
})

export const UNIT_STATUSES = ["available", "on-hold", "booked", "sold", "blocked"]

export function stockNow(data, project) {
  const units = ofProject(data.units, project)
  const count = (s) => units.filter((u) => u.status === s).length
  const available = units.filter((u) => u.status === "available")
  const in24h = Date.now() + 86_400_000
  const holds = units.filter((u) => u.status === "on-hold")
  return {
    total: units.length,
    available: available.length,
    availableValue: round(sum(available, (u) => u.price)),
    soldPct: share(count("booked") + count("sold"), units.length),
    onHold: holds.length,
    expiringSoon: holds.filter((u) => u.holdExpiresAt && new Date(u.holdExpiresAt).getTime() <= in24h).length,
  }
}

// Per project: units by status, stock value and the sold share
export function byProject(data, project) {
  return (project ? data.projects.filter((p) => p.id === project.id) : data.projects)
    .map((p) => {
      const units = data.units.filter((u) => u.projectId === p.id)
      const counts = Object.fromEntries(UNIT_STATUSES.map((s) => [s, units.filter((u) => u.status === s).length]))
      return {
        code: p.code,
        name: p.name,
        color: p.color,
        total: units.length,
        ...counts,
        availableValue: round(
          sum(
            units.filter((u) => u.status === "available"),
            (u) => u.price,
          ),
        ),
        soldPct: share(counts.booked + counts.sold, units.length),
      }
    })
    .filter((p) => p.total > 0)
}

// Holds running out soonest, with who's holding them
export async function holdsEnding(data, project, limit = 6) {
  const holds = ofProject(data.units, project)
    .filter((u) => u.status === "on-hold")
    .sort((a, b) => new Date(a.holdExpiresAt ?? 8.64e15) - new Date(b.holdExpiresAt ?? 8.64e15))
    .slice(0, limit)
  const people = await peopleByIds(holds.map((u) => u.holdBy))
  const projects = new Map(data.projects.map((p) => [p.id, p]))
  return holds.map((u) => ({ code: u.code, number: u.number, type: u.type, project: projects.get(u.projectId)?.name ?? "", by: people.get(u.holdBy)?.name ?? null, expiresAt: u.holdExpiresAt }))
}

// Rates on each project's active price list
export async function activeRates(ctx, project) {
  const [lists, lookups] = await Promise.all([activeListsByProject(ctx), getLookups(ctx.db, ["unit-type"])])
  const projects = await projectList(ctx.db)
  const label = (v) => lookups["unit-type"].find((x) => x.value === v)?.label ?? v
  return projects
    .filter((p) => (!project || p.id === project.id) && lists[p.code])
    .flatMap((p) => lists[p.code].rates.map((r) => ({ project: p.name, list: lists[p.code].name, type: label(r.type), category: r.category, sizeValue: r.sizeValue, sizeUnit: r.sizeUnit, rate: r.rate })))
}
