// Workspace (tenant) databases.
//
//   yarn tenant:migrate [--all]    bring every workspace database up to date (migrations + default seeds)
//   yarn tenant:migrate TEN00001   just one workspace
//
// Safe to run again: migrations that already ran are skipped, and seeds only add missing defaults.
// Run it after deploying code that adds tenant migrations.
import nextEnv from "@next/env"

// Local: .env.local (+ .env.development). On the server run with NODE_ENV=production to use .env.production
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const { platformDb, closeAll } = await import("../src/server/db/connections.js")
const { migrateTenantDb } = await import("../src/server/tenants/provision.js")

// "--all" (or nothing) means every workspace
const [command, arg] = process.argv.slice(2)
const only = arg && arg !== "--all" ? arg : null
if (command !== "migrate") {
  console.error("Usage: yarn tenant:migrate [TENANT_CODE]")
  process.exit(1)
}

let failed = 0
try {
  let q = platformDb()("tenants").whereNull("deletedAt").whereNot({ status: "provisioning" }).orderBy("id")
  if (only) q = q.where({ code: only.toUpperCase() })
  const tenants = await q.select("id", "code", "name", "dbName", "dbHost")
  if (!tenants.length) console.log(only ? `No workspace ${only}.` : "No workspaces yet.")
  for (const t of tenants) {
    try {
      const version = await migrateTenantDb(t)
      await platformDb()("tenants").where({ id: t.id }).update({ schemaVersion: version, seedVersion: version, updatedAt: new Date() })
      console.log(`✓ ${t.code} ${t.name} (${t.dbName}) → ${version}`)
    } catch (err) {
      failed++
      console.error(`✗ ${t.code} ${t.name}: ${err.message}`)
    }
  }
} finally {
  await closeAll()
}
process.exit(failed ? 1 : 0)
