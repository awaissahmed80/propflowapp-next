"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { insert, live, softDelete, update } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { can } from "@/modules/console/roles"
import { IBAN_PATTERN, PAYMENT_GATEWAYS, normalizeIban } from "@/modules/console/payments"
import { clearSiteSettingsCache, getSiteSettings } from "@/server/platform-settings"
import { renderEmail } from "@/server/mail/render"
import { EMAIL_SAMPLES } from "@/server/mail/samples"
import { sendMail } from "@/server/mail/send"
import { logAudit } from "./audit"
import { PAYMENT_SETTINGS_KEY, getPaymentSettings, missingKeys } from "./payments"
import { cleanOff } from "@/modules/portal/features"

// Console changes. Each action checks the caller's session and role itself: server actions can
// be called directly, whatever the page showed.

async function requirePlans() {
  const staff = await requireStaff("/plans")
  if (!can(staff.role, "plans")) return { staff, error: "You don't have permission to change plans." }
  return { staff }
}

const limit = z.union([z.null(), z.number().int().min(1, "At least 1, or leave blank for unlimited.").max(100_000)])
const planSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Give the plan a name.").max(60),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,29}$/, "Lowercase letters, numbers and dashes, starting with a letter.")
    .optional(),
  description: z.string().trim().max(255).nullable(),
  priceMonthly: z.number({ message: "Enter a price." }).min(0).max(10_000_000),
  maxProjects: limit,
  maxUsers: limit,
  maxDealers: z.union([z.null(), z.number().int().min(0).max(100_000)]),
  isPublic: z.boolean(),
  apps: z.array(z.string()).max(50),
  // Features switched off per app: { estate: ["resale"] } (see portal/features.js)
  off: z.record(z.string(), z.array(z.string())).optional().default({}),
})

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`
const cap = (n) => (n == null ? "unlimited" : n)

// Create (no id) or update a plan with its apps. Returns { ok, id } or { error, fieldErrors }.
export async function savePlan(input) {
  const { staff, error } = await requirePlans()
  if (error) return { error }
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const { id, code, apps: appCodes, off, ...fields } = parsed.data
  const offFor = (app) => {
    const keys = cleanOff(app, off[app])
    return keys.length ? JSON.stringify(keys) : null
  }

  const db = platformDb()
  // Only real, active apps; always-on apps (My Desk) come with every plan anyway
  const apps = await live(db, "apps").whereIn("code", appCodes).where({ isActive: true, alwaysOn: false }).select("id", "code", "name")
  if (!apps.length) return { fieldErrors: { apps: "Switch on at least one app." } }

  if (!id) {
    if (!code) return { fieldErrors: { code: "Give the plan a code." } }
    // Codes stay reserved even after a plan is deleted, so old records never point at a new plan
    if (await db("plans").where({ code }).first("id")) return { fieldErrors: { code: "That code is already used by another plan." } }
  }

  let planId = id
  await db.transaction(async (trx) => {
    if (id) {
      const before = await live(trx, "plans").where({ id }).forUpdate().first()
      if (!before) throw new Error("Plan not found.")
      const beforeRows = await trx("planApps as pa").join("apps as a", "a.id", "pa.appId").where("pa.planId", id).select("a.code", "pa.offFeatures")
      const beforeApps = beforeRows.map((r) => r.code)
      await update(trx, "plans", { id }, fields, staff.user.id)
      await trx("planApps").where({ planId: id }).delete()
      await trx("planApps").insert(apps.map((a) => ({ planId: id, appId: a.id, offFeatures: offFor(a.code) })))
      const sameKeys = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort())
      const featuresChanged = apps.some((a) => !sameKeys(cleanOff(a.code, off[a.code]), cleanOff(a.code, beforeRows.find((r) => r.code === a.code)?.offFeatures)))

      const added = apps.filter((a) => !beforeApps.includes(a.code)).map((a) => `+ ${a.name}`)
      const removed = beforeApps.filter((c) => !apps.some((a) => a.code === c)).map((c) => `− ${c}`)
      const changes = [
        before.name !== fields.name && `renamed from ${before.name}`,
        before.priceMonthly !== fields.priceMonthly && `price ${rs(before.priceMonthly)} → ${rs(fields.priceMonthly)}`,
        before.maxProjects !== fields.maxProjects && `projects ${cap(before.maxProjects)} → ${cap(fields.maxProjects)}`,
        before.maxUsers !== fields.maxUsers && `users ${cap(before.maxUsers)} → ${cap(fields.maxUsers)}`,
        before.maxDealers !== fields.maxDealers && `dealers ${cap(before.maxDealers)} → ${cap(fields.maxDealers)}`,
        before.isPublic !== fields.isPublic && (fields.isPublic ? "shown on website" : "hidden from website"),
        (added.length || removed.length) && `apps ${[...added, ...removed].join(", ")}`,
        featuresChanged && "features",
        before.description !== fields.description && "description",
      ].filter(Boolean)
      if (changes.length) {
        await logAudit({ actorUserId: staff.user.id, action: "plan.updated", subjectType: "plan", subjectId: id, details: { summary: `${fields.name}: ${changes.join("; ")}` } }, trx)
      }
    } else {
      const last = await trx("plans").max({ max: "sortOrder" }).first()
      planId = await insert(trx, "plans", { ...fields, code, currency: "PKR", sortOrder: (last?.max ?? 0) + 10 }, staff.user.id)
      await trx("planApps").insert(apps.map((a) => ({ planId, appId: a.id, offFeatures: offFor(a.code) })))
      await logAudit({ actorUserId: staff.user.id, action: "plan.created", subjectType: "plan", subjectId: planId, details: { summary: `${fields.name} at ${rs(fields.priceMonthly)} a month, ${apps.length} apps` } }, trx)
    }
  })
  return { ok: true, id: planId }
}

// Disabled plans can't be chosen at signup or when changing plan; workspaces on them keep them
export async function setPlanActive(id, active) {
  const { staff, error } = await requirePlans()
  if (error) return { error }
  const db = platformDb()
  const plan = await live(db, "plans")
    .where({ id: Number(id) })
    .first("id", "name", "isActive")
  if (!plan) return { error: "Plan not found." }
  if (!active) {
    const others = await live(db, "plans").whereNot({ id: plan.id }).where({ isActive: true }).count({ n: "*" }).first()
    if (!Number(others.n)) return { error: "Keep at least one plan available for new customers." }
  }
  await update(db, "plans", { id: plan.id }, { isActive: Boolean(active) }, staff.user.id)
  await logAudit({ actorUserId: staff.user.id, action: active ? "plan.enabled" : "plan.disabled", subjectType: "plan", subjectId: plan.id, details: { summary: plan.name } })
  return { ok: true }
}

// Only a plan no workspace has ever used can be deleted; otherwise disable it
export async function deletePlan(id) {
  const { staff, error } = await requirePlans()
  if (error) return { error }
  const db = platformDb()
  const plan = await live(db, "plans")
    .where({ id: Number(id) })
    .first("id", "name")
  if (!plan) return { error: "Plan not found." }
  // Deleted workspaces count too: their records still point at the plan
  const used = await Promise.all([db("tenants").where({ planId: plan.id }).first("id"), db("subscriptions").where({ planId: plan.id }).first("id")])
  if (used.some(Boolean)) return { error: `${plan.name} has been used by workspaces, so it can't be deleted. Disable it instead.` }
  const others = await live(db, "plans").whereNot({ id: plan.id }).where({ isActive: true }).count({ n: "*" }).first()
  if (!Number(others.n)) return { error: "Keep at least one plan available for new customers." }
  await softDelete(db, "plans", { id: plan.id }, staff.user.id)
  await logAudit({ actorUserId: staff.user.id, action: "plan.deleted", subjectType: "plan", subjectId: plan.id, details: { summary: plan.name } })
  return { ok: true }
}

// ---------- payment methods ----------

const bankSchema = z.object({
  bankName: z.string().trim().max(80),
  accountTitle: z.string().trim().max(120),
  accountNumber: z.string().trim().max(30),
  iban: z.string().trim().max(40),
  branch: z.string().trim().max(120),
  instructions: z.string().trim().max(500),
})
const paymentsSchema = z.object({ enabled: z.record(z.string(), z.boolean()), bank: bankSchema })

// Switch methods on or off and save the bank account customers transfer to
export async function savePaymentSettings(input) {
  const staff = await requireStaff("/payment-methods")
  if (!can(staff.role, "billing")) return { error: "You don't have permission to change payment methods." }
  const parsed = paymentsSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the details and try again." }
  const { enabled, bank } = parsed.data
  bank.iban = normalizeIban(bank.iban)

  const fieldErrors = {}
  if (bank.iban && !IBAN_PATTERN.test(bank.iban)) fieldErrors.iban = "A Pakistani IBAN is 24 characters: PK, 2 digits, 4 letters, 16 digits."
  if (enabled.bank) {
    if (!bank.bankName) fieldErrors.bankName = "Enter the bank."
    if (!bank.accountTitle) fieldErrors.accountTitle = "Enter the account title."
    if (!bank.iban) fieldErrors.iban = "Enter the IBAN."
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  const result = {}
  for (const g of PAYMENT_GATEWAYS) {
    const on = Boolean(enabled[g.id])
    if (on && missingKeys(g).length) return { error: `${g.label} can't be switched on until its keys are added to the server's .env.` }
    result[g.id] = on
  }

  const db = platformDb()
  const before = await getPaymentSettings()
  const value = JSON.stringify({ enabled: result, bank })
  await db("settings")
    .insert({ key: PAYMENT_SETTINGS_KEY, value, description: "Payment methods offered to customers, and the bank account for transfers", updatedAt: new Date(), updatedBy: staff.user.id })
    .onConflict("key")
    .merge(["value", "updatedAt", "updatedBy"])

  const label = (id) => PAYMENT_GATEWAYS.find((g) => g.id === id).label
  const changes = [
    ...PAYMENT_GATEWAYS.filter((g) => before.methods.find((m) => m.id === g.id).enabled !== result[g.id]).map((g) => `${label(g.id)} ${result[g.id] ? "on" : "off"}`),
    Object.keys(bank).some((k) => before.bank[k] !== bank[k]) && "bank details updated",
  ].filter(Boolean)
  if (changes.length) {
    await logAudit({ actorUserId: staff.user.id, action: "payments.updated", subjectType: "settings", details: { summary: changes.join(", ") } })
  }
  return { ok: true, noneEnabled: !Object.values(result).some(Boolean) }
}

// ---------- site status and sign-up ----------

const siteSchema = z.object({
  maintenance: z.boolean(),
  message: z.string().trim().max(300).nullable(),
  until: z.string().trim().max(60).nullable(),
  signupOpen: z.boolean(),
  pricesVisible: z.boolean(),
  quoteRequests: z.boolean().default(true),
  signInVisible: z.boolean().default(true),
  analyticsId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(G-[A-Z0-9]{4,20})?$/, "A Measurement ID looks like G-XXXXXXXXXX.")
    .nullable()
    .default(null),
  analyticsConsent: z.boolean().default(false),
})

// Maintenance mode, self sign-up, price visibility and custom quotes (owner and administrators)
export async function saveSiteSettings(input) {
  const staff = await requireStaff("/settings")
  if (!can(staff.role, "settings")) return { error: "Only the owner or an administrator can change platform settings." }
  const parsed = siteSchema.safeParse(input)
  if (!parsed.success) {
    const idIssue = parsed.error.issues.find((i) => i.path[0] === "analyticsId")
    return idIssue ? { fieldErrors: { analyticsId: idIssue.message } } : { error: "Check the details and try again." }
  }
  const v = parsed.data
  v.analyticsId = v.analyticsId || null
  if (v.until && Number.isNaN(Date.parse(v.until))) return { fieldErrors: { until: "Pick a date and time." } }

  const before = await getSiteSettings()
  const db = platformDb()
  const now = new Date()
  const status = { mode: v.maintenance ? "maintenance" : "live", message: v.maintenance ? v.message || null : null, until: v.maintenance ? v.until || null : null }
  await db.transaction(async (trx) => {
    for (const [key, value] of [
      ["site_status", status],
      ["signup_mode", v.signupOpen ? "open" : "invite"],
      ["prices_visible", v.pricesVisible],
      ["quote_requests", v.quoteRequests],
      ["signin_visible", v.signInVisible],
      ["analytics_id", v.analyticsId],
      ["analytics_consent", v.analyticsConsent],
    ]) {
      await trx("settings")
        .insert({ key, value: JSON.stringify(value), updatedAt: now, updatedBy: staff.user.id })
        .onConflict("key")
        .merge(["value", "updatedAt", "updatedBy"])
    }
    if (before.maintenance !== v.maintenance) {
      await logAudit(
        {
          actorUserId: staff.user.id,
          action: v.maintenance ? "site.maintenance_on" : "site.maintenance_off",
          subjectType: "settings",
          details: { summary: v.maintenance ? (status.message ?? "No message") : "Visitors and workspaces can use PropFlow again" },
        },
        trx,
      )
    } else if (v.maintenance && (before.message !== status.message || before.until !== status.until)) {
      await logAudit({ actorUserId: staff.user.id, action: "site.maintenance_updated", subjectType: "settings", details: { summary: status.message ?? "No message" } }, trx)
    }
    if (before.signupOpen !== v.signupOpen) {
      await logAudit(
        {
          actorUserId: staff.user.id,
          action: v.signupOpen ? "signup.opened" : "signup.invite_only",
          subjectType: "settings",
          details: { summary: v.signupOpen ? "Anyone can start a trial" : "New workspaces join by invitation" },
        },
        trx,
      )
    }
    if (before.signInVisible !== v.signInVisible) {
      await logAudit(
        {
          actorUserId: staff.user.id,
          action: v.signInVisible ? "signin_link.shown" : "signin_link.hidden",
          subjectType: "settings",
          details: { summary: v.signInVisible ? "The website shows Sign in" : "Sign in is hidden on the website (the sign-in page still works)" },
        },
        trx,
      )
    }
    if (before.analyticsId !== v.analyticsId || before.analyticsConsent !== v.analyticsConsent) {
      const summary = v.analyticsId ? `Google Analytics ${v.analyticsId}${v.analyticsConsent ? ", visitors are asked first" : ""}` : "Google Analytics is off"
      await logAudit({ actorUserId: staff.user.id, action: v.analyticsId ? "analytics.updated" : "analytics.off", subjectType: "settings", details: { summary } }, trx)
    }
    if (before.quoteRequests !== v.quoteRequests) {
      await logAudit(
        {
          actorUserId: staff.user.id,
          action: v.quoteRequests ? "quotes.on" : "quotes.off",
          subjectType: "settings",
          details: { summary: v.quoteRequests ? "Visitors can ask for a custom quote" : "Custom quote requests are off" },
        },
        trx,
      )
    }
    if (before.pricesVisible !== v.pricesVisible) {
      await logAudit(
        {
          actorUserId: staff.user.id,
          action: v.pricesVisible ? "pricing.shown" : "pricing.hidden",
          subjectType: "settings",
          details: { summary: v.pricesVisible ? "Plan prices are on the website" : "Plan prices are hidden on the website" },
        },
        trx,
      )
    }
  })
  clearSiteSettingsCache()
  return { ok: true }
}

// ---------- email previews ----------

// Send one email template, filled with its example data, to the person asking (subject marked [Test])
export async function sendTestEmail(template) {
  const staff = await requireStaff("/emails")
  if (!can(staff.role, "settings")) return { error: "Only the owner or an administrator can send test emails." }
  const sample = EMAIL_SAMPLES[template]
  if (!sample) return { error: "Unknown email." }
  try {
    const { subject, html, text } = await renderEmail(template, sample.data)
    const sent = await sendMail({ to: staff.user.email, subject: `[Test] ${subject}`, html, text })
    return sent.ok ? { ok: true, to: staff.user.email } : { error: `Resend couldn't send it: ${sent.error}` }
  } catch (err) {
    return { error: `The template has a problem: ${err.message}` }
  }
}
