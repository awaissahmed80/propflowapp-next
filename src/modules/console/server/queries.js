import "server-only"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { canView } from "@/modules/console/roles"
import { cleanOff, withoutText } from "@/modules/portal/features"
import { featuresFor, packageFor } from "@/modules/web/quote"

// Read side of the console. Everything comes from pf_platform, with people's names and emails
// from pf_auth. Figures that live inside tenant databases (projects, bookings) come later.

const DAY = 86_400_000

// id → { id, name, email, phone } for pf_auth users
export async function usersByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await authDb()("users").whereIn("id", unique).select("id", "name", "email", "phone", "status", "avatarUrl")
  return new Map(rows.map((u) => [u.id, u]))
}

// Stable colour for a workspace mark, from its code
const MARK_COLORS = ["#2a78d6", "#1baf7a", "#c98500", "#e34948", "#4a3aa7", "#2a9fd6", "#1b9f96", "#9085e9"]
const markColor = (code) => MARK_COLORS[[...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % MARK_COLORS.length]

// Monthly value of a subscription: yearly prices are spread over 12 months
const monthly = (sub) => (sub ? (sub.billingCycle === "yearly" ? Math.round(sub.price / 12) : sub.price) : 0)

export async function listPlans() {
  const db = platformDb()
  const [plans, planApps, apps, usage] = await Promise.all([
    live(db, "plans").orderBy("sortOrder").orderBy("id"),
    db("planApps as pa").join("apps as a", "a.id", "pa.appId").select("pa.planId", "a.code", "pa.offFeatures"),
    live(db, "apps").where({ isActive: true }).orderBy("sortOrder").select("id", "code", "name", "description", "icon", "color", "category", "alwaysOn"),
    live(db, "tenants").groupBy("planId").select("planId").count({ n: "*" }),
  ])
  return {
    plans: plans.map((p) => ({
      ...p,
      apps: planApps.filter((x) => x.planId === p.id).map((x) => x.code),
      // Switched-off features per app: { estate: ["resale"] }
      off: Object.fromEntries(planApps.filter((x) => x.planId === p.id && cleanOff(x.code, x.offFeatures).length).map((x) => [x.code, cleanOff(x.code, x.offFeatures)])),
      workspaces: Number(usage.find((u) => u.planId === p.id)?.n ?? 0),
    })),
    apps,
  }
}

export async function getSetting(key, fallback = null) {
  const row = await platformDb()("settings").where({ key }).first("value")
  return row?.value ?? fallback
}

async function decorate(tenants) {
  const db = platformDb()
  const ids = tenants.map((t) => t.id)
  const [subs, members, owners] = await Promise.all([
    ids.length ? live(db, "subscriptions").whereIn("tenantId", ids).where({ status: "active" }) : [],
    ids.length
      ? authDb()("memberships").whereIn("tenantId", ids).whereNull("deletedAt").where({ status: "active" }).groupBy("tenantId").select("tenantId").count({ users: "*" })
      : [],
    usersByIds(tenants.map((t) => t.ownerUserId)),
  ])
  return tenants.map((t) => {
    const sub = subs.find((s) => s.tenantId === t.id)
    return {
      ...t,
      color: markColor(t.code),
      owner: owners.get(t.ownerUserId) ?? null,
      users: Number(members.find((m) => m.tenantId === t.id)?.users ?? 0),
      mrr: t.status === "active" ? monthly(sub) : 0,
      trialDaysLeft: t.status === "trial" && t.trialEndsAt ? Math.ceil((t.trialEndsAt - Date.now()) / DAY) : null,
    }
  })
}

const tenantColumns = (q) =>
  q
    .join("plans as p", "p.id", "tenants.planId")
    .select(
      "tenants.id",
      "tenants.code",
      "tenants.slug",
      "tenants.name",
      "tenants.city",
      "tenants.phone",
      "tenants.email",
      "tenants.ownerUserId",
      "tenants.billingCycle",
      "tenants.status",
      "tenants.trialEndsAt",
      "tenants.currentPeriodEndsAt",
      "tenants.suspendedReason",
      "tenants.currency",
      "tenants.dbName",
      "tenants.dbHost",
      "tenants.ntn",
      "tenants.provisioningError",
      "tenants.provisionedAt",
      "tenants.createdAt",
      "p.id as planId",
      "p.name as planName",
      "p.maxUsers",
      "p.maxProjects"
    )

export async function listWorkspaces() {
  const rows = await tenantColumns(live(platformDb(), "tenants")).orderBy("tenants.createdAt", "desc")
  return decorate(rows)
}

export async function getWorkspace(code) {
  const db = platformDb()
  const row = await tenantColumns(live(db, "tenants")).where("tenants.code", code).first()
  if (!row) return null
  const [t] = await decorate([row])
  const [apps, planApps, members, invoices, activity] = await Promise.all([
    db("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where("ta.tenantId", t.id).orderBy("a.sortOrder").select("a.code", "a.name", "a.icon", "a.color", "a.alwaysOn", "ta.offFeatures"),
    db("planApps as pa").join("apps as a", "a.id", "pa.appId").where("pa.planId", t.planId).pluck("a.code"),
    authDb()("memberships as m")
      .join("users as u", "u.id", "m.userId")
      .where("m.tenantId", t.id)
      .whereNull("m.deletedAt")
      .whereNull("u.deletedAt")
      .select("u.id", "u.name", "u.email", "u.status", "u.avatarUrl", "m.status as membershipStatus"),
    listInvoices({ tenantId: t.id }),
    listAudit({ tenantId: t.id, limit: 30 }),
  ])
  // "Extra" = switched on beyond the plan (always-on apps like My Desk come with every workspace)
  // off: features of the app this workspace doesn't have
  return { ...t, apps: apps.map(({ offFeatures, ...a }) => ({ ...a, off: cleanOff(a.code, offFeatures), extra: !a.alwaysOn && !planApps.includes(a.code) })), members, invoices, activity }
}

// Invoices with the workspace name and the latest payment (method, reference, status)
export async function listInvoices({ tenantId } = {}) {
  const db = platformDb()
  let q = live(db, "invoices")
    .join("tenants as t", "t.id", "invoices.tenantId")
    .select("invoices.id", "invoices.code", "invoices.tenantId", "t.code as tenantCode", "t.name as tenantName", "invoices.total", "invoices.currency", "invoices.status", "invoices.issuedAt", "invoices.dueAt", "invoices.paidAt")
    .orderBy("invoices.issuedAt", "desc")
  if (tenantId) q = q.where("invoices.tenantId", tenantId)
  const invoices = await q
  const payments = invoices.length
    ? await live(db, "invoicePayments").whereIn("invoiceId", invoices.map((i) => i.id)).orderBy("id", "desc").select("invoiceId", "method", "reference", "status", "paidAt")
    : []
  return invoices.map((inv) => {
    const payment = payments.find((p) => p.invoiceId === inv.id) ?? null
    const awaiting = ["issued", "overdue"].includes(inv.status) && payment?.status === "pending"
    return { ...inv, payment, displayStatus: awaiting ? "awaiting" : inv.status }
  })
}

export async function platformMetrics() {
  const [list, invoices, plans] = await Promise.all([listWorkspaces(), listInvoices(), listPlans()])
  const now = Date.now()
  const paying = list.filter((t) => t.status === "active")
  const trials = list.filter((t) => t.status === "trial")
  // Last 6 months in Pakistan time
  const byMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - (5 - i))
    const key = d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Karachi" })
    return {
      month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Karachi" }),
      signups: list.filter((t) => t.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Karachi" }) === key).length,
    }
  })
  return {
    total: list.length,
    mrr: paying.reduce((s, t) => s + t.mrr, 0),
    paying: paying.length,
    trials: trials.length,
    endingSoon: trials.filter((t) => t.trialDaysLeft != null && t.trialDaysLeft <= 7).sort((a, b) => a.trialDaysLeft - b.trialDaysLeft),
    atRisk: list.filter((t) => ["past_due", "suspended"].includes(t.status)),
    awaiting: invoices.filter((i) => i.displayStatus === "awaiting"),
    signups30: list.filter((t) => now - t.createdAt.getTime() < 30 * DAY).length,
    byMonth,
    planMix: plans.plans.map((p) => ({ plan: p.name, count: list.filter((t) => t.planId === p.id && t.status !== "closed").length })),
    recent: list.slice(0, 5),
  }
}

// Enquiries, newest first. Quote requests also get the modules they asked for (by name) and the
// smallest public plan that includes all of them.
export async function listEnquiries() {
  const db = platformDb()
  const rows = await live(db, "enquiries").orderBy("createdAt", "desc")
  const people = await usersByIds(rows.map((r) => r.assignedTo))
  const quotes = rows.some((r) => r.kind === "quote")
  const [apps, plans, planApps] = quotes
    ? await Promise.all([
        live(db, "apps").select("code", "name", "icon", "color"),
        live(db, "plans").where({ isPublic: true, isActive: true }).orderBy("priceMonthly").select("id", "name", "priceMonthly"),
        db("planApps as pa").join("apps as a", "a.id", "pa.appId").select("pa.planId", "a.code", "pa.offFeatures"),
      ])
    : [[], [], []]
  // The cheapest public plan that has every app they need, without any wanted feature switched off
  const suggest = (needs) => {
    const wanted = featuresFor(needs)
    return (
      plans.find((p) =>
        wanted.every((f) => {
          const [app, key] = f.split(".")
          const row = planApps.find((x) => x.planId === p.id && x.code === app)
          return row && !cleanOff(app, row.offFeatures).includes(key)
        }),
      ) ?? null
    )
  }
  return rows.map((r) => {
    const out = { ...r, assignee: people.get(r.assignedTo) ?? null }
    if (r.kind !== "quote") return out
    const needs = r.interests ?? []
    const pkg = packageFor(needs)
    const plan = suggest(needs)
    return {
      ...out,
      needs,
      package: pkg,
      modules: pkg.apps.map((c) => ({ ...(apps.find((a) => a.code === c) ?? { code: c, name: c }), without: withoutText(c, pkg.off[c]) })),
      suggestedPlan: plan ? { id: plan.id, name: plan.name, priceMonthly: Number(plan.priceMonthly) } : null,
    }
  })
}

export async function listRequests({ code } = {}) {
  const db = platformDb()
  let q = live(db, "supportRequests")
    .join("tenants as t", "t.id", "supportRequests.tenantId")
    .select("supportRequests.*", "t.code as tenantCode", "t.name as tenantName", "t.city as tenantCity")
    .orderBy("supportRequests.updatedAt", "desc")
  if (code) q = q.where("supportRequests.code", code)
  const rows = await q
  const people = await usersByIds(rows.flatMap((r) => [r.raisedBy, r.assignedTo]))
  return rows.map((r) => ({ ...r, raisedByUser: people.get(r.raisedBy) ?? null, assignee: people.get(r.assignedTo) ?? null }))
}

export async function getRequest(code) {
  const [r] = await listRequests({ code })
  if (!r) return null
  const messages = await platformDb()("supportMessages").where({ requestId: r.id }).orderBy("createdAt")
  const people = await usersByIds(messages.map((m) => m.authorId))
  return { ...r, messages: messages.map((m) => ({ ...m, author: people.get(m.authorId) ?? null })) }
}

export async function listTeam() {
  const staff = await live(platformDb(), "platformStaff").select("userId", "role", "isActive", "createdAt").orderBy("id")
  const people = await usersByIds(staff.map((s) => s.userId))
  return staff.map((s) => ({ ...people.get(s.userId), ...s, id: s.userId })).filter((s) => s.name)
}

// Console invitations still waiting for an answer (expired ones included, so they can be resent)
export async function listTeamInvites() {
  const rows = await live(authDb(), "invitations")
    .where({ kind: "console" })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .orderBy("id", "desc")
    .select("id", "email", "name", "consoleRole", "invitedBy", "expiresAt", "createdAt")
  const people = await usersByIds(rows.map((r) => r.invitedBy))
  return rows.map((r) => ({
    ...r,
    invitedByName: people.get(r.invitedBy)?.name ?? "—",
    state: r.revokedAt ? "cancelled" : r.expiresAt < new Date() ? "expired" : "pending",
  }))
}

export async function listAudit({ tenantId, limit = 200 } = {}) {
  let q = platformDb()("auditLog as a").leftJoin("tenants as t", "t.id", "a.tenantId").select("a.*", "t.code as tenantCode", "t.name as tenantName").orderBy("a.id", "desc").limit(limit)
  if (tenantId) q = q.where("a.tenantId", tenantId)
  const rows = await q
  const people = await usersByIds(rows.map((r) => r.actorUserId))
  return rows.map((r) => ({ ...r, actor: people.get(r.actorUserId)?.name ?? "System" }))
}

// Badges in the sidebar, only for sections the role can see
export async function navCounts(role) {
  const db = platformDb()
  const count = async (q) => Number((await q.count({ n: "*" }))[0].n) || null
  const [workspaces, enquiries, requests, billing] = await Promise.all([
    canView(role, "workspaces") ? count(live(db, "tenants")) : null,
    canView(role, "enquiries") ? count(live(db, "enquiries").where({ status: "new" })) : null,
    canView(role, "requests") ? count(live(db, "supportRequests").where({ status: "open" })) : null,
    canView(role, "billing") ? listInvoices().then((l) => l.filter((i) => i.displayStatus === "awaiting").length || null) : null,
  ])
  return { "/workspaces": workspaces, "/enquiries": enquiries, "/requests": requests, "/billing": billing }
}

// Workspace invitations not used yet: pending, expired, and cancelled in the last 30 days,
// so any of them can be sent again with a new link
export async function listWorkspaceInvites() {
  const rows = await platformDb()("workspaceInvitations as wi")
    .whereNull("wi.deletedAt")
    .join("plans as p", "p.id", "wi.planId")
    .whereNull("wi.acceptedAt")
    .where((q) => q.whereNull("wi.revokedAt").orWhere("wi.revokedAt", ">", new Date(Date.now() - 30 * DAY)))
    .orderBy("wi.id", "desc")
    .select("wi.id", "wi.revokedAt", "wi.email", "wi.contactName", "wi.phone", "wi.companyName", "wi.billingCycle", "wi.startAs", "wi.trialDays", "wi.price", "wi.note", "wi.invitedBy", "wi.expiresAt", "wi.createdAt", "p.name as planName", "p.priceMonthly")
  const people = await usersByIds(rows.map((r) => r.invitedBy))
  return rows.map((r) => ({ ...r, invitedByName: people.get(r.invitedBy)?.name ?? "—", expired: r.expiresAt < new Date() }))
}

// One invoice with its lines, payments and workspace, for the invoice page
export async function getInvoice(code) {
  const db = platformDb()
  const inv = await live(db, "invoices").where({ code }).first()
  if (!inv) return null
  const [tenant, lines, payments] = await Promise.all([
    db("tenants").where({ id: inv.tenantId }).first("id", "code", "name", "city", "address", "phone", "email", "ntn", "ownerUserId"),
    live(db, "invoiceLines").where({ invoiceId: inv.id }).orderBy("sortOrder"),
    live(db, "invoicePayments").where({ invoiceId: inv.id }).orderBy("id"),
  ])
  const people = await usersByIds([tenant.ownerUserId, inv.createdBy, ...payments.map((p) => p.verifiedBy)])
  return {
    ...inv,
    taxRate: Number(inv.taxRate),
    tenant: { ...tenant, owner: people.get(tenant.ownerUserId) ?? null },
    lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
    payments: payments.map((p) => ({ ...p, verifiedByName: people.get(p.verifiedBy)?.name ?? null })),
    createdByName: people.get(inv.createdBy)?.name ?? null,
  }
}

const isoDay = (d) => new Date(new Date(d).getTime() + 5 * 3_600_000).toISOString().slice(0, 10)

// What a new invoice for this workspace would normally contain: who it's billed to, the plan for
// the next period (from the current period's end, or the trial's), and any extra apps
export async function invoiceSuggestion(tenantId) {
  const db = platformDb()
  const t = await live(db, "tenants")
    .where({ id: tenantId })
    .first("id", "code", "name", "city", "address", "phone", "email", "ntn", "ownerUserId", "planId", "billingCycle", "trialEndsAt", "currentPeriodEndsAt")
  if (!t) return null
  const owner = t.ownerUserId ? (await usersByIds([t.ownerUserId])).get(t.ownerUserId) : null
  const [plan, sub, yearlyMonths, extras] = await Promise.all([
    db("plans").where({ id: t.planId }).first("name", "priceMonthly"),
    live(db, "subscriptions").where({ tenantId: t.id, status: "active" }).orderBy("id", "desc").first("price", "billingCycle"),
    getSetting("yearly_months_charged", 10),
    db("tenantApps as ta")
      .join("apps as a", "a.id", "ta.appId")
      .where("ta.tenantId", t.id)
      .where("a.alwaysOn", false)
      .whereNotIn("a.id", db("planApps").where({ planId: t.planId }).select("appId"))
      .orderBy("a.sortOrder")
      .select("a.name"),
  ])
  const cycle = sub?.billingCycle ?? t.billingCycle
  const price = sub?.price ?? (cycle === "yearly" ? plan.priceMonthly * yearlyMonths : plan.priceMonthly)
  const now = new Date()
  const from = [t.currentPeriodEndsAt, t.trialEndsAt].map((d) => (d ? new Date(d) : null)).find((d) => d && d > now) ?? now
  const start = new Date(from.getTime() + 60_000)
  const end = new Date(start)
  if (cycle === "yearly") end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  end.setDate(end.getDate() - 1)
  return {
    // Who the invoice goes to, as it will be printed and where it will be emailed
    billTo: { code: t.code, name: t.name, owner: owner?.name ?? null, email: t.email || owner?.email || null, phone: t.phone || owner?.phone || null, city: t.city, address: t.address, ntn: t.ntn },
    periodStart: isoDay(start),
    periodEnd: isoDay(end),
    lines: [
      { description: `${plan.name} plan, ${cycle}${cycle === "yearly" ? ` (${yearlyMonths} months charged)` : ""}`, quantity: 1, unitPrice: price },
      ...extras.map((a) => ({ description: `Extra app: ${a.name}`, quantity: 1, unitPrice: 0 })),
    ],
  }
}
