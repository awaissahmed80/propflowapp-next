import "server-only"
import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"

// Getting a new workspace ready: what's been filled in, and what's still required before the
// team starts working. Only the company profile is required; the logo, cash & bank accounts and
// preferences are optional (defaults are fine, and accounts can be added later in Finance).

export const PROFILE_KEYS = ["company_name", "company_legal_name", "company_address", "company_city", "company_phone", "company_email", "company_ntn", "company_strn", "company_secp", "company_website"]
export const REQUIRED_PROFILE = ["company_name", "company_legal_name", "company_address", "company_city", "company_phone", "company_email"]
const OTHER_KEYS = ["company_logo", "financial_year_start_month", "marla_sq_ft", "setup_preferences_saved_at", "setup_completed_at"]

export const db = (tenant) => tenantDb({ dbName: tenant.dbName, dbHost: tenant.dbHost })

// key → value for the workspace's settings
export async function readSettings(tenant, keys) {
  const rows = await db(tenant)("settings").whereIn("key", keys).select("key", "value")
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function writeSettings(tenant, values, userId) {
  const now = new Date()
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: JSON.stringify(value ?? null), updatedAt: now, updatedBy: userId }))
  if (rows.length) await db(tenant)("settings").insert(rows).onConflict("key").merge(["value", "updatedAt", "updatedBy"])
}

// Everything the setup page shows, plus which steps are done
export async function getSetup(tenant) {
  const [settings, accounts] = await Promise.all([readSettings(tenant, [...PROFILE_KEYS, ...OTHER_KEYS]), live(db(tenant), "accounts").whereNotNull("kind").where({ isActive: true }).orderBy("sortOrder").orderBy("code")])
  const filled = (k) => typeof settings[k] === "string" && settings[k].trim().length > 0
  const banks = accounts.filter((a) => a.kind === "bank")
  const steps = {
    profile: REQUIRED_PROFILE.every(filled),
    logo: filled("company_logo"),
    accounts: banks.length > 0,
    preferences: Boolean(settings.setup_preferences_saved_at),
  }
  return {
    settings,
    accounts: accounts.map((a) => ({ ...a, openingBalance: Number(a.openingBalance) })),
    steps,
    requiredDone: steps.profile,
    completedAt: settings.setup_completed_at ?? null,
  }
}

// Owners (all permissions) and roles with settings access can set the workspace up
export const canSetUp = (permissions = []) => permissions.includes("*") || permissions.includes("settings") || permissions.some((p) => p.startsWith("settings."))
