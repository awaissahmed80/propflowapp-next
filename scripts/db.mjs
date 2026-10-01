// Database commands for the central databases (pf_platform, pf_auth).
// Tenant databases get their own commands with provisioning.
//
//   yarn db:create                       create pf_platform and pf_auth if missing
//   yarn db:check                        connect to both and show migration status
//   yarn db:migrate <platform|auth>      run new migrations
//   yarn db:rollback <platform|auth>     undo the last batch
//   yarn db:status [platform|auth]       applied and pending migrations
//   yarn db:make <platform|auth|tenant> <name>   new migration file, e.g. create_tenants
//   yarn db:seed <platform|auth>         run the seeders
import fs from "node:fs"
import path from "node:path"
import nextEnv from "@next/env"

// Local: .env.local (+ .env.development). On the server run with NODE_ENV=production to use .env.production
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const { AUTH_DB, PLATFORM_DB } = await import("../src/server/db/config.js")
const { migrationDb, provisionDb } = await import("../src/server/db/connections.js")

const ROOT = path.resolve("src/server/db")
const TARGETS = { platform: PLATFORM_DB(), auth: AUTH_DB() }
const dirs = (target) => ({ migrations: path.join(ROOT, "migrations", target), seeds: path.join(ROOT, "seeds", target) })
const say = (...a) => console.log(...a)

function target(name, { tenant = false } = {}) {
  const allowed = tenant ? ["platform", "auth", "tenant"] : Object.keys(TARGETS)
  if (!allowed.includes(name)) {
    console.error(`Say which database: ${allowed.join(" or ")}.`)
    process.exit(1)
  }
  return name
}

// Knex runs files in name order; .gitkeep and other non-migration files are ignored
const migrateOptions = (t) => ({ directory: dirs(t).migrations, loadExtensions: [".js"], tableName: "knex_migrations" })

async function withDb(t, fn) {
  const db = migrationDb(TARGETS[t])
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

const commands = {
  async create() {
    const db = provisionDb()
    try {
      for (const name of Object.values(TARGETS)) {
        await db.raw("CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", [name])
        say(`✓ ${name}`)
      }
    } finally {
      await db.destroy()
    }
  },

  async check() {
    for (const [t, name] of Object.entries(TARGETS))
      await withDb(t, async (db) => {
        const [[row]] = await db.raw("SELECT DATABASE() AS db, @@session.time_zone AS tz, VERSION() AS version")
        const [done, pending] = await db.migrate.list(migrateOptions(t))
        say(`✓ ${row.db} · MySQL ${row.version} · session time zone ${row.tz} · ${done.length} applied, ${pending.length} pending`)
      })
  },

  async migrate(t) {
    target(t)
    await withDb(t, async (db) => {
      const [batch, files] = await db.migrate.latest(migrateOptions(t))
      say(files.length ? `✓ ${TARGETS[t]}: batch ${batch}\n  ${files.join("\n  ")}` : `✓ ${TARGETS[t]} is up to date`)
    })
  },

  async rollback(t) {
    target(t)
    await withDb(t, async (db) => {
      const [batch, files] = await db.migrate.rollback(migrateOptions(t))
      say(files.length ? `✓ ${TARGETS[t]}: rolled back batch ${batch}\n  ${files.join("\n  ")}` : `Nothing to roll back in ${TARGETS[t]}`)
    })
  },

  async status(t) {
    for (const name of t ? [target(t)] : Object.keys(TARGETS))
      await withDb(name, async (db) => {
        const [done, pending] = await db.migrate.list(migrateOptions(name))
        say(`${TARGETS[name]}`)
        for (const m of done) say(`  ✓ ${m.name}`)
        for (const m of pending) say(`  … ${m.file}`)
        if (!done.length && !pending.length) say("  (no migrations yet)")
      })
  },

  async make(t, name) {
    target(t, { tenant: true })
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      console.error("Give the migration a snake_case name, e.g. create_tenants.")
      process.exit(1)
    }
    const d = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
    const table = name.replace(/^create_/, "")
    const file = path.join(dirs(t).migrations, `${stamp}_${name}.js`)
    fs.writeFileSync(
      file,
      `import { tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  await knex.schema.createTable("${table}", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    // columns…
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("${table}")
}
`
    )
    say(`✓ ${path.relative(process.cwd(), file)}`)
  },

  async seed(t) {
    target(t)
    await withDb(t, async (db) => {
      const [files] = await db.seed.run({ directory: dirs(t).seeds, loadExtensions: [".js"] })
      say(files.length ? `✓ ${TARGETS[t]}\n  ${files.map((f) => path.basename(f)).join("\n  ")}` : `No seeders in ${dirs(t).seeds}`)
    })
  },
}

const [command, ...args] = process.argv.slice(2)
if (!commands[command]) {
  console.error(`Unknown command "${command ?? ""}". Use: ${Object.keys(commands).join(", ")}.`)
  process.exit(1)
}
try {
  await commands[command](...args)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exitCode = 1
}
