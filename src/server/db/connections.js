import knex from "knex"
import { caseMapping } from "./case.js"
import { AUTH_DB, PLATFORM_DB, POOL_MAX, TENANT_POOL_MAX, connection } from "./config.js"

// One connection pool each for pf_platform and pf_auth, and one small pool per tenant database,
// created on first use and closed after a while without use, so thousands of tenants don't hold
// thousands of idle connections.

// Every connection works in UTC, whatever the server's own time zone is
const afterCreate = (conn, done) => conn.query("SET time_zone = '+00:00'", (err) => done(err, conn))

function create({ database, max, host, mapCase = true, provision = false }) {
  return knex({
    client: "mysql2",
    connection: connection({ database, host, provision }),
    pool: { min: 0, max, afterCreate },
    ...(mapCase ? caseMapping : {}),
  })
}

// Kept on globalThis so Next's dev reloads reuse pools instead of opening new ones
const store = (globalThis.__pfDb ??= { central: new Map(), tenants: new Map() })

export function platformDb() {
  if (!store.central.has("platform")) store.central.set("platform", create({ database: PLATFORM_DB(), max: POOL_MAX() }))
  return store.central.get("platform")
}

export function authDb() {
  if (!store.central.has("auth")) store.central.set("auth", create({ database: AUTH_DB(), max: POOL_MAX() }))
  return store.central.get("auth")
}

// tenant: { dbName, dbHost } from the pf_platform tenants table
const IDLE_MS = 10 * 60_000
export function tenantDb(tenant) {
  const key = `${tenant.dbHost ?? ""}/${tenant.dbName}`
  let entry = store.tenants.get(key)
  if (!entry) {
    entry = { db: create({ database: tenant.dbName, host: tenant.dbHost || undefined, max: TENANT_POOL_MAX() }) }
    store.tenants.set(key, entry)
  }
  entry.usedAt = Date.now()
  return entry.db
}

// Close tenant pools nobody has used for a while
function sweep() {
  const now = Date.now()
  for (const [key, entry] of store.tenants)
    if (now - entry.usedAt > IDLE_MS) {
      store.tenants.delete(key)
      entry.db.destroy().catch(() => {})
    }
}
if (!store.sweeper) {
  store.sweeper = setInterval(sweep, 60_000)
  store.sweeper.unref?.()
}

// Raw connections for scripts: migrations (no case mapping, Knex's own tables are snake_case)
// and provisioning (the user allowed to create databases, no database selected)
export const migrationDb = (database, { host } = {}) => create({ database, host, max: 1, mapCase: false })
export const provisionDb = ({ host } = {}) => create({ host, max: 1, mapCase: false, provision: true })

export async function closeAll() {
  const all = [...store.central.values(), ...[...store.tenants.values()].map((e) => e.db)]
  store.central.clear()
  store.tenants.clear()
  await Promise.all(all.map((db) => db.destroy()))
}
