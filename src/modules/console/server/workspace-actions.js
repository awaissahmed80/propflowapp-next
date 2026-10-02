"use server"

import { z } from "zod"
import { authDb, platformDb } from "@/server/db/connections"
import { live, update } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { provisionTenant } from "@/server/tenants/provision"
import { slugProblem } from "@/lib/workspace"
import { can } from "@/modules/console/roles"
import { logAudit } from "./audit"
import { urlCode } from "@/lib/url"
import { cleanOff, withoutText } from "@/modules/portal/features"

// Changes to one workspace from the console. Owner and admin manage workspaces (apps, details,
// suspension, setup); owner, admin and finance manage billing (trial and renewal dates, plan).
// Every change is written to the audit log with the workspace's id.

const DAY = 86_400_000

async function staffFor(area, code) {
  const staff = await requireStaff(`/workspaces/${urlCode(code ?? "")}`)
  if (!can(staff.role, area)) return { error: area === "billing" ? "Only the owner, an administrator or finance can change billing." : "Only the owner or an administrator can change workspaces." }
  return { staff }
}

async function tenantById(id) {
  return live(platformDb(), "tenants")
    .where({ id: Number(id) })
    .first()
}

const fmt = (d) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "—")

// ---------- apps ----------

// Switch the workspace's apps on or off, and features inside them (off: { app: [keys] }), for a
// custom package. Always-on apps (My Desk) can't be switched off.
export async function setWorkspaceApps(tenantId, appCodes, off = {}) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("workspaces", t.code)
  if (error) return { error }
  if (!Array.isArray(appCodes)) return { error: "Pick the apps." }

  const db = platformDb()
  const apps = await live(db, "apps").where({ isActive: true }).select("id", "code", "name", "alwaysOn")
  const wanted = apps.filter((a) => a.alwaysOn || appCodes.includes(a.code))
  const before = await db("tenantApps as ta").join("apps as a", "a.id", "ta.appId").where("ta.tenantId", t.id).select("a.id", "a.code", "a.name", "ta.offFeatures")
  const added = wanted.filter((a) => !before.some((b) => b.id === a.id))
  const removed = before.filter((b) => !wanted.some((a) => a.id === b.id))
  const offOf = (code) => cleanOff(code, off?.[code])
  const same = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort())
  const reshaped = wanted.filter((a) => before.some((b) => b.id === a.id && !same(cleanOff(a.code, b.offFeatures), offOf(a.code))))
  if (!added.length && !removed.length && !reshaped.length) return { ok: true }
  const offJson = (code) => (offOf(code).length ? JSON.stringify(offOf(code)) : null)

  await db.transaction(async (trx) => {
    if (removed.length)
      await trx("tenantApps")
        .where({ tenantId: t.id })
        .whereIn(
          "appId",
          removed.map((a) => a.id),
        )
        .delete()
    if (added.length) await trx("tenantApps").insert(added.map((a) => ({ tenantId: t.id, appId: a.id, enabledBy: staff.user.id, offFeatures: offJson(a.code) })))
    for (const a of reshaped)
      await trx("tenantApps")
        .where({ tenantId: t.id, appId: a.id })
        .update({ offFeatures: offJson(a.code) })
    await logAudit(
      {
        actorUserId: staff.user.id,
        action: "tenant.apps_changed",
        subjectType: "tenant",
        subjectId: t.id,
        tenantId: t.id,
        details: {
          summary: [...added.map((a) => `+ ${a.name}`), ...removed.map((a) => `− ${a.name}`), ...reshaped.map((a) => `${a.name} ${withoutText(a.code, offOf(a.code)) || "with all features"}`)].join(", "),
          added: added.map((a) => a.code),
          removed: removed.map((a) => a.code),
        },
      },
      trx,
    )
  })
  return { ok: true }
}

// ---------- details ----------

const detailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(150),
  slug: z.string().trim().toLowerCase().max(40),
  city: z.string().trim().max(60).nullable(),
  phone: z.string().trim().max(20).nullable(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email."))]).nullable(),
  ntn: z.string().trim().max(20).nullable(),
})

export async function updateWorkspaceDetails(tenantId, input) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("workspaces", t.code)
  if (error) return { error }
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = { ...parsed.data, city: parsed.data.city || null, phone: parsed.data.phone || null, email: parsed.data.email || null, ntn: parsed.data.ntn || null }

  if (v.slug !== t.slug) {
    const problem = slugProblem(v.slug)
    if (problem) return { fieldErrors: { slug: problem } }
    if (await live(platformDb(), "tenants").where({ slug: v.slug }).whereNot({ id: t.id }).first("id")) return { fieldErrors: { slug: "That short name is taken." } }
  }
  const labels = { name: "name", slug: "short name", city: "city", phone: "phone", email: "email", ntn: "NTN" }
  const changed = Object.keys(labels).filter((k) => (t[k] ?? null) !== v[k])
  if (!changed.length) return { ok: true }

  await update(platformDb(), "tenants", { id: t.id }, v, staff.user.id)
  await logAudit({
    actorUserId: staff.user.id,
    action: "tenant.details_changed",
    subjectType: "tenant",
    subjectId: t.id,
    tenantId: t.id,
    details: { summary: changed.map((k) => `${labels[k]}: ${t[k] ?? "—"} → ${v[k] ?? "—"}`).join("; ") },
  })
  return { ok: true }
}

// ---------- suspend / reactivate ----------

export async function suspendWorkspace(tenantId, reason) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("workspaces", t.code)
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 3) return { fieldErrors: { reason: "Say why, so the team knows later." } }
  if (why.length > 255) return { fieldErrors: { reason: "Keep it under 255 characters." } }
  if (t.status === "suspended") return { ok: true }

  await update(platformDb(), "tenants", { id: t.id }, { status: "suspended", suspendedAt: new Date(), suspendedReason: why }, staff.user.id)
  // Everyone signed in to this workspace is signed out
  await authDb()("sessions").where({ kind: "tenant", tenantId: t.id }).whereNull("revokedAt").update({ revokedAt: new Date() })
  await logAudit({ actorUserId: staff.user.id, action: "tenant.suspended", subjectType: "tenant", subjectId: t.id, tenantId: t.id, details: { summary: why, previousStatus: t.status } })
  return { ok: true }
}

export async function reactivateWorkspace(tenantId) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("workspaces", t.code)
  if (error) return { error }
  if (t.status !== "suspended") return { ok: true }
  // Back to a trial if it still has trial time, otherwise active
  const status = t.trialEndsAt && new Date(t.trialEndsAt) > new Date() ? "trial" : "active"
  await update(platformDb(), "tenants", { id: t.id }, { status, suspendedAt: null, suspendedReason: null }, staff.user.id)
  await logAudit({ actorUserId: staff.user.id, action: "tenant.reactivated", subjectType: "tenant", subjectId: t.id, tenantId: t.id, details: { summary: `Back to ${status === "trial" ? "trial" : "active"}` } })
  return { ok: true }
}

// ---------- setup ----------

// Run database setup again for a workspace whose setup failed (safe to repeat)
export async function retryWorkspaceSetup(tenantId) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("workspaces", t.code)
  if (error) return { error }
  if (t.status !== "provisioning") return { ok: true }
  const finalStatus = t.trialEndsAt ? "trial" : "active"
  const result = await provisionTenant(t.id, { finalStatus, company: { name: t.name, city: t.city } })
  await logAudit({
    actorUserId: staff.user.id,
    action: "tenant.setup_retried",
    subjectType: "tenant",
    subjectId: t.id,
    tenantId: t.id,
    details: { summary: result.ok ? "Setup finished" : `Setup failed again: ${result.error}` },
  })
  return result.ok ? { ok: true } : { error: `Setup failed again: ${result.error}` }
}

// ---------- billing: dates and plan ----------

// Move the trial end (trial workspaces) or the renewal date (paying ones).
// Either { days } to add, or { date: "yyyy-MM-dd" } for a new end date (end of that day, Pakistan time).
export async function extendWorkspace(tenantId, { days, date } = {}) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("billing", t.code)
  if (error) return { error }
  const trial = t.status === "trial" || (t.status === "suspended" && t.trialEndsAt && !t.currentPeriodEndsAt)
  const field = trial ? "trialEndsAt" : "currentPeriodEndsAt"
  const current = t[field] ? new Date(t[field]) : null

  let next
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." }
    next = new Date(`${date}T23:59:59+05:00`)
  } else {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 366) return { error: "Choose between 1 and 366 days." }
    next = new Date(Math.max(Date.now(), current?.getTime() ?? 0) + n * DAY)
  }
  if (next <= new Date()) return { error: "The new date has to be in the future." }

  const patch = { [field]: next }
  // A past-due workspace given more time is paying again
  if (!trial && t.status === "past_due") patch.status = "active"
  await update(platformDb(), "tenants", { id: t.id }, patch, staff.user.id)
  if (!trial) await platformDb()("subscriptions").where({ tenantId: t.id, status: "active" }).whereNull("deletedAt").update({ endsAt: next, updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({
    actorUserId: staff.user.id,
    action: "tenant.trial_extended",
    subjectType: "tenant",
    subjectId: t.id,
    tenantId: t.id,
    details: { summary: `${trial ? "Trial ends" : "Renews"} ${fmt(current)} → ${fmt(next)}`, field },
  })
  return { ok: true }
}

// Move the workspace to another plan and/or billing cycle. resetApps: apps become exactly the
// new plan's (plus always-on); otherwise the new plan's apps are added and nothing is removed.
export async function changeWorkspacePlan(tenantId, { planId, billingCycle, resetApps = false } = {}) {
  const t = await tenantById(tenantId)
  if (!t) return { error: "Workspace not found." }
  const { staff, error } = await staffFor("billing", t.code)
  if (error) return { error }
  if (!["monthly", "yearly"].includes(billingCycle)) return { error: "Pick monthly or yearly." }
  const db = platformDb()
  const [plan, oldPlan] = await Promise.all([
    live(db, "plans")
      .where({ id: Number(planId), isActive: true })
      .first("id", "name", "priceMonthly"),
    db("plans").where({ id: t.planId }).first("name"),
  ])
  if (!plan) return { error: "That plan isn't available." }
  if (plan.id === t.planId && billingCycle === t.billingCycle && !resetApps) return { ok: true }

  const yearlyMonths = (await db("settings").where({ key: "yearly_months_charged" }).first("value"))?.value ?? 10
  await db.transaction(async (trx) => {
    await update(trx, "tenants", { id: t.id }, { planId: plan.id, billingCycle }, staff.user.id)
    const price = billingCycle === "yearly" ? plan.priceMonthly * yearlyMonths : plan.priceMonthly
    // A paying workspace's subscription follows the new plan and price (trials have none yet)
    await trx("subscriptions").where({ tenantId: t.id, status: "active" }).whereNull("deletedAt").update({ planId: plan.id, billingCycle, price, updatedAt: new Date(), updatedBy: staff.user.id })
    const planRows = await trx("planApps").where({ planId: plan.id }).select("appId", "offFeatures")
    const planAppIds = planRows.map((r) => r.appId)
    const alwaysOn = await live(trx, "apps").where({ alwaysOn: true, isActive: true }).pluck("id")
    const wanted = [...new Set([...planAppIds, ...alwaysOn])]
    const current = (await trx("tenantApps").where({ tenantId: t.id }).select("appId")).map((r) => r.appId)
    if (resetApps) await trx("tenantApps").where({ tenantId: t.id }).whereNotIn("appId", wanted).delete()
    const add = wanted.filter((id) => !current.includes(id))
    const offFor = (appId) => planRows.find((r) => r.appId === appId)?.offFeatures ?? null
    if (add.length) await trx("tenantApps").insert(add.map((appId) => ({ tenantId: t.id, appId, enabledBy: staff.user.id, offFeatures: offFor(appId) ? JSON.stringify(offFor(appId)) : null })))
    // Reset: the plan's features too
    if (resetApps)
      for (const r of planRows)
        await trx("tenantApps")
          .where({ tenantId: t.id, appId: r.appId })
          .update({ offFeatures: r.offFeatures ? JSON.stringify(r.offFeatures) : null })
    await logAudit(
      {
        actorUserId: staff.user.id,
        action: "tenant.plan_changed",
        subjectType: "tenant",
        subjectId: t.id,
        tenantId: t.id,
        details: { summary: `${oldPlan?.name ?? "—"} (${t.billingCycle}) → ${plan.name} (${billingCycle})${resetApps ? ", apps reset to the plan" : ""}` },
      },
      trx,
    )
  })
  return { ok: true }
}
