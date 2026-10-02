import "server-only"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { withoutText } from "@/modules/portal/features"
import { getInvoice, getSetting } from "@/modules/console/server/queries"
import { getPaymentSettings } from "@/modules/console/server/payments"
import { seatUsage } from "@/modules/users/server/queries"

// Settings › Subscription & Billing: the workspace's plan, apps, usage and PropFlow invoices.
// ctx: settingsPage(); everything billing comes from pf_platform.

const DAY = 86_400_000

export async function getBilling(ctx) {
  const db = platformDb()
  const tenantId = ctx.tenant.id
  const [tenant, plans, apps, tenantApps, planApps, invoices, payments, projects, sub] = await Promise.all([
    db("tenants").where({ id: tenantId }).first("id", "code", "name", "planId", "billingCycle", "status", "trialEndsAt", "currentPeriodEndsAt", "createdAt", "currency"),
    live(db, "plans").orderBy("sortOrder").orderBy("id"),
    live(db, "apps").where({ isActive: true }).orderBy("sortOrder").select("id", "code", "name", "icon", "color", "alwaysOn"),
    db("tenantApps").where({ tenantId }).select("appId", "offFeatures"),
    db("planApps").select("planId", "appId"),
    live(db, "invoices").where({ tenantId }).whereNot({ status: "draft" }).orderBy("issuedAt", "desc").select("id", "code", "total", "currency", "status", "issuedAt", "dueAt", "paidAt", "periodStart", "periodEnd"),
    db("invoicePayments as p")
      .join("invoices as i", "i.id", "p.invoiceId")
      .where("i.tenantId", tenantId)
      .whereNull("p.deletedAt")
      .orderBy("p.id", "desc")
      .select("p.invoiceId", "p.method", "p.reference", "p.status", "p.paidAt"),
    live(ctx.db, "projects").count("id as n").first(),
    live(db, "subscriptions").where({ tenantId, status: "active" }).orderBy("id", "desc").first("price", "billingCycle", "extraUsers"),
  ])
  const plan = plans.find((p) => p.id === tenant.planId)
  const seats = await seatUsage({ ...ctx, tenant: { ...ctx.tenant, planId: tenant.planId } })
  const [{ methods, bank }, yearlyMonths] = await Promise.all([getPaymentSettings(), getSetting("yearly_months_charged", 10)])
  const enabled = new Set(tenantApps.map((a) => a.appId))
  const inPlan = (planId) => new Set(planApps.filter((x) => x.planId === planId).map((x) => x.appId))
  const mine = inPlan(tenant.planId)
  const shapePlan = (p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: Number(p.priceMonthly),
    currency: p.currency,
    maxProjects: p.maxProjects,
    maxUsers: p.maxUsers,
    maxDealers: p.maxDealers,
    apps: apps.filter((a) => inPlan(p.id).has(a.id) && !a.alwaysOn && !["settings", "users"].includes(a.code)).map((a) => a.name),
  })
  return {
    tenant: {
      status: tenant.status,
      billingCycle: tenant.billingCycle,
      trialEndsAt: tenant.trialEndsAt,
      currentPeriodEndsAt: tenant.currentPeriodEndsAt,
      daysLeft: tenant.trialEndsAt ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / DAY)) : null,
      trialDays: tenant.trialEndsAt ? Math.max(1, Math.round((new Date(tenant.trialEndsAt).getTime() - new Date(tenant.createdAt).getTime()) / DAY)) : null,
    },
    plan: plan ? shapePlan(plan) : null,
    price: sub
      ? { amount: Number(sub.price), cycle: sub.billingCycle }
      : plan
        ? { amount: tenant.billingCycle === "yearly" ? Number(plan.priceMonthly) * Number(yearlyMonths) : Number(plan.priceMonthly), cycle: tenant.billingCycle }
        : null,
    yearlyMonths: Number(yearlyMonths),
    plans: plans.filter((p) => p.isPublic && (p.isActive ?? true)).map(shapePlan),
    apps: apps
      .filter((a) => enabled.has(a.id) && a.code !== "settings")
      .map((a) => ({ code: a.code, name: a.name, icon: a.icon, color: a.color, extra: !a.alwaysOn && !mine.has(a.id), without: withoutText(a.code, tenantApps.find((t) => t.appId === a.id)?.offFeatures) })),
    usage: { users: { used: seats.used, limit: seats.limit }, dealers: seats.dealers, projects: { used: Number(projects?.n ?? 0), limit: plan?.maxProjects ?? null } },
    invoices: invoices.map((i) => {
      const payment = payments.find((p) => p.invoiceId === i.id) ?? null
      const awaiting = ["issued", "overdue"].includes(i.status) && payment?.status === "pending"
      const { id, ...rest } = i // ids stay on the server
      return { ...rest, total: Number(i.total), payment: payment && { method: payment.method, reference: payment.reference, status: payment.status }, displayStatus: awaiting ? "awaiting" : i.status }
    }),
    bank: methods.find((m) => m.id === "bank")?.enabled && bank.iban ? bank : null,
  }
}

// One of this workspace's invoices (never another workspace's, never a draft)
export async function workspaceInvoice(tenantId, code) {
  const inv = await getInvoice(String(code ?? "").toUpperCase())
  if (!inv || inv.tenantId !== tenantId || inv.status === "draft") return null
  return inv
}

// Bank details for the invoice footer, when bank transfer is switched on
export async function invoiceBank() {
  const { methods, bank } = await getPaymentSettings()
  return methods.find((m) => m.id === "bank")?.enabled ? bank : null
}
