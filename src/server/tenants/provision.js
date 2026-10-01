import path from "node:path"
import { migrationDb, platformDb, provisionDb } from "../db/connections.js"

// Creates a workspace's own database and brings it up to date: pf_<code> with the tenant
// migrations and default seeds (roles, settings). Safe to run again: every step skips what's
// already done, so a failed setup can simply be retried from the console.
// No "server-only" here, so command-line scripts can provision too.

const DIR = path.resolve(process.cwd(), "src/server/db")
const MIGRATIONS = { directory: path.join(DIR, "migrations/tenant"), loadExtensions: [".js"], tableName: "knex_migrations" }
const SEEDS = { directory: path.join(DIR, "seeds/tenant"), loadExtensions: [".js"] }

// Bring one tenant database up to date; returns the newest migration name
export async function migrateTenantDb({ dbName, dbHost }) {
  const db = migrationDb(dbName, { host: dbHost || undefined })
  try {
    await db.migrate.latest(MIGRATIONS)
    await db.seed.run(SEEDS)
    const [done] = await db.migrate.list(MIGRATIONS)
    return done.at(-1)?.name ?? null
  } finally {
    await db.destroy()
  }
}

// tenantId: pf_platform tenants.id. finalStatus: what the workspace becomes once ready (trial | active).
// company: { name, city } written into the workspace's settings.
// Returns { ok: true } or { ok: false, error }, and records the outcome on the tenant row.
export async function provisionTenant(tenantId, { finalStatus, company = {} }) {
  const platform = platformDb()
  const tenant = await platform("tenants").where({ id: tenantId }).first("id", "code", "dbName", "dbHost", "status")
  if (!tenant) return { ok: false, error: "Workspace not found." }

  try {
    const admin = provisionDb({ host: tenant.dbHost || undefined })
    try {
      await admin.raw("CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", [tenant.dbName])
    } finally {
      await admin.destroy()
    }

    const schemaVersion = await migrateTenantDb(tenant)

    // Company details the owner entered at setup
    const db = migrationDb(tenant.dbName, { host: tenant.dbHost || undefined })
    try {
      const rows = [
        ["company_name", company.name, "Company name on documents and receipts"],
        ["company_city", company.city ?? null, "Head office city"],
      ].map(([key, value, description]) => ({ key, value: JSON.stringify(value ?? null), description, updated_at: new Date() }))
      await db("settings").insert(rows).onConflict("key").merge(["value", "updated_at"])
    } finally {
      await db.destroy()
    }

    await platform("tenants")
      .where({ id: tenant.id })
      .update({ status: finalStatus, schemaVersion, seedVersion: schemaVersion, provisionedAt: new Date(), provisioningError: null, updatedAt: new Date() })
    return { ok: true }
  } catch (err) {
    console.error(`Provisioning ${tenant.code} failed:`, err)
    await platform("tenants")
      .where({ id: tenant.id })
      .update({ provisioningError: String(err.message ?? err).slice(0, 2000), updatedAt: new Date() })
    return { ok: false, error: err.message ?? String(err) }
  }
}
