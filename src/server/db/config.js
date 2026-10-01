// Database settings from the environment. Three kinds of database live on the MySQL server:
//   pf_platform        console: tenants registry, plans, invoices, platform staff
//   pf_auth            central sign-in: users, memberships, sessions, one-time codes
//   pf_<tenant code>   one per subscriber, e.g. pf_ten00042 (never the workspace slug)

const env = (key, fallback) => {
  const value = process.env[key]
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing environment variable ${key}. See .env.example.`)
  }
  return value
}

export const PLATFORM_DB = () => env("DB_PLATFORM_NAME", "pf_platform")
export const AUTH_DB = () => env("DB_AUTH_NAME", "pf_auth")
export const TENANT_PREFIX = () => env("DB_TENANT_PREFIX", "pf_")

// Names a tenant database can never take
export const RESERVED_DB_NAMES = () => [PLATFORM_DB(), AUTH_DB()]

// pf_ + the tenant's permanent code, lowercased: TEN00042 → pf_ten00042
export function tenantDbName(code) {
  const clean = String(code).toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!clean) throw new Error("A tenant code is required for its database name.")
  const name = `${TENANT_PREFIX()}${clean}`
  if (RESERVED_DB_NAMES().includes(name)) throw new Error(`${name} is reserved.`)
  if (name.length > 64) throw new Error(`${name} is longer than MySQL allows.`)
  return name
}

// Connection details for a user (app or provisioning) and, optionally, a database
export function connection({ database, provision = false, host } = {}) {
  return {
    host: host ?? env("DB_HOST"),
    port: Number(env("DB_PORT", "3306")),
    user: provision ? env("DB_PROVISION_USER") : env("DB_USER"),
    password: provision ? env("DB_PROVISION_PASSWORD") : env("DB_PASSWORD"),
    ...(database ? { database } : {}),
    // Store and read every date as UTC; screens show Pakistan time
    timezone: "Z",
    charset: "utf8mb4",
    supportBigNumbers: true,
    // DECIMAL money comes back as strings unless asked; numbers are what the app works with
    decimalNumbers: true,
    // BOOLEAN columns are TINYINT(1): return true / false instead of 1 / 0
    typeCast(field, next) {
      if (field.type === "TINY" && field.length === 1) {
        const v = field.string()
        return v === null ? null : v === "1"
      }
      return next()
    },
    ...(env("DB_SSL", "false") === "true" ? { ssl: {} } : {}),
  }
}

export const POOL_MAX = () => Number(env("DB_POOL_MAX", "10"))
export const TENANT_POOL_MAX = () => Number(env("DB_TENANT_POOL_MAX", "5"))
