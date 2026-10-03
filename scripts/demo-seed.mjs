// Demo workspace for marketing screenshots and sales demos (LOCAL DEVELOPMENT ONLY).
//
//   yarn demo:seed            create the "Skyline Developers" workspace once (does nothing if it exists)
//   yarn demo:seed --reset    drop its database and demo users, then build it again
//   yarn demo:seed --check    counts, trial balance and a few app queries against the demo workspace
//
// Sign in at portal.propflowapp.test with the demo owner:
//   email     owner@skyline-demo.test
//   password  a3X6-2HWm-Hh2K   (local test value; every @skyline-demo.test team member uses it too)
//
// The data comes from the Vite reference app's demo dataset (../propflowapp/data, tenant TEN-001;
// override with DEMO_SOURCE=/path/to/data). Dates are spread over the last 12 months up to today.
// Bookings, payments, cheques, cancellations, refunds, commission payouts and Estate Management
// fees are posted to Finance with the app's own posters, in date order, so the books match.
import { registerHooks } from "node:module"
import { readFileSync, existsSync } from "node:fs"
import crypto from "node:crypto"
import path from "node:path"
import nextEnv from "@next/env"
import { resolve as appResolve } from "./lib/app-imports.mjs"

// App code imported for the --check queries also reaches Next.js entry points ("next/navigation"):
// give them their file extension so Node can load them
const NEXT_ENTRIES = ["next/navigation", "next/headers", "next/cache"]
registerHooks({
  resolve(specifier, context, next) {
    if (NEXT_ENTRIES.includes(specifier)) return next(`${specifier}.js`, context)
    return appResolve(specifier, context, next)
  },
})
if (process.env.NODE_ENV === "production") {
  console.error("demo:seed is for local development only.")
  process.exit(1)
}
nextEnv.loadEnvConfig(process.cwd(), true)

const { platformDb, authDb, tenantDb, provisionDb, closeAll } = await import("../src/server/db/connections.js")
const { tenantDbName } = await import("../src/server/db/config.js")
const { nextCode } = await import("../src/server/db/numbering.js")
const { provisionTenant } = await import("../src/server/tenants/provision.js")
const { hashPassword } = await import("../src/server/auth/secrets.js")
const posting = await import("../src/modules/finance/server/posting.js")
const { refreshBooking } = await import("../src/modules/operations/server/ledger.js")
const { paymentSchedule, isCashPlan } = await import("../src/modules/portfolio/pricing.js")
const { templateSections, fillPlaceholders, THEME_DEFAULTS } = await import("../src/modules/campaigns/landing/library.js")
const { DEFAULT_SETTINGS, dueFrom } = await import("../src/modules/estate/constants.js")
const { normalizePhone } = await import("../src/lib/phone.js")

// ---------- the demo workspace ----------

const SLUG = "skyline"
const DOMAIN = "skyline-demo.test"
const OWNER_EMAIL = `owner@${DOMAIN}`
const PASSWORD = "a3X6-2HWm-Hh2K" // local test value (see the top of this file)
const COMPANY = {
  name: "Skyline Developers",
  legalName: "Skyline Developers (Pvt.) Ltd.",
  city: "Lahore",
  address: "Office 402, Gulberg Office Plaza, Main Boulevard, Gulberg III, Lahore",
  phone: "+92 42 3578 0000",
  email: `info@${DOMAIN}`,
  ntn: "4410235-7",
  strn: "3277876154321",
  secp: "0145522",
  website: "skyline-demo.test",
}
const SOURCE = process.env.DEMO_SOURCE ?? path.resolve(process.cwd(), "../propflowapp/data")
const VITE_TENANT = "TEN-001"

// People: Vite user → login, role, profile (names from master/members.json)
const PEOPLE = {
  "USR-0006": { email: "owner", role: "owner" },
  "USR-0002": { role: "admin", designation: "gm-sales" },
  "USR-0004": { role: "sales-manager" },
  "USR-0007": { role: "team-lead" },
  "USR-0008": { role: "sales-agent" },
  "USR-0009": { role: "sales-agent" },
  "USR-0010": { role: "sales-agent" },
  "USR-0011": { role: "sales-agent" },
  "USR-0012": { role: "sales-agent" },
  "USR-0013": { role: "accountant" },
  "USR-0014": { role: "dealer" },
  "USR-0015": { role: "dealer" },
  "USR-0018": { role: "estate-officer", designation: "estate-officer", department: "estate-office" },
  "USR-0019": { role: "estate-officer", designation: "site-engineer", department: "construction" },
}
// Designations and departments the Vite data uses beyond PropFlow's defaults
const EXTRA_LOOKUPS = [
  ["designation", "gm-sales", "GM Sales"],
  ["designation", "senior-sales-executive", "Senior sales executive"],
  ["designation", "estate-officer", "Estate officer"],
  ["designation", "site-engineer", "Site engineer"],
  ["designation", "dealer", "Dealer"],
  ["department", "estate-office", "Estate office"],
  ["department", "construction", "Construction"],
  ["department", "external", "External partners"],
]
const BANKS = [
  {
    code: "1130",
    name: "Meezan Bank · Collections",
    bankName: "Meezan Bank",
    title: "Skyline Developers (Pvt.) Ltd. Collections",
    number: "0102-XXXX-XX7821",
    iban: "PK36MEZN00000102XXXXXX7821",
    branch: "Main Boulevard Gulberg, Lahore",
    isDefault: true,
  },
  { code: "1140", name: "HBL · Current", bankName: "Habib Bank Limited", title: "Skyline Developers (Pvt.) Ltd.", number: "1234-XXXX-XXXX-4411", iban: "PK24HABB00001234XXXXXX4411", branch: "Mall Road, Lahore" },
  {
    code: "1150",
    name: "Bank Alfalah · Payroll",
    bankName: "Bank Alfalah",
    title: "Skyline Developers (Pvt.) Ltd. Payroll",
    number: "5501-XXXX-XXXX-9877",
    iban: "PK89ALFH00005501XXXXXX9877",
    branch: "DHA Phase 5, Lahore",
  },
]
// Portal brand names never appear in PropFlow: vendors and text get generic names
const VENDOR_NAMES = { "VND-005": "PropertyLink Media", "VND-007": "HomeFinder Listings" }
const SOURCE_MAP = { zameen: "property-portal", graana: "property-portal", olx: "property-portal", "site-visit": "site-office" }
const clean = (s) =>
  typeof s === "string"
    ? s
        .replace(/zameen media/gi, "PropertyLink Media")
        .replace(/graana(\.com)?/gi, "HomeFinder Listings")
        .replace(/zameen(\.com)?/gi, "property portal")
        .replace(/\bolx\b/gi, "classifieds")
        .replace(/cancelled/g, "canceled")
        .replace(/Cancelled/g, "Canceled")
        .replace(/centre/g, "center")
        .replace(/Centre/g, "Center")
    : s

// ---------- dates ----------

const NOW = new Date()
const DAY = 86_400_000
const HOUR = 3_600_000
const pkDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d)
const TODAY = new Date(`${pkDay(NOW)}T00:00:00+05:00`)
// The latest moment records are dated: now in office hours, otherwise the end of the last working day
const PK_HOUR = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).format(NOW))
const REF = PK_HOUR >= 9 && PK_HOUR < 18 ? new Date(NOW.getTime() - 10 * 60_000) : new Date(TODAY.getTime() - (PK_HOUR < 9 ? DAY : 0) + (17 * 60 + 45) * 60_000)
const capNow = (d) => new Date(Math.min(d.getTime(), REF.getTime()))
// n days ago at a Pakistan time of day (today's times still to come fall on yesterday); n < 0 is in the future
function daysAgo(n, hour = 11, minute = 0) {
  const d = new Date(TODAY.getTime() - n * DAY + (hour * 60 + minute) * 60_000)
  if (n < 0) return d
  return capNow(d > REF ? new Date(d.getTime() - DAY) : d)
}
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000)
// Planned follow-ups and due times land in office hours (10:00–17:45 Pakistan time, on the quarter hour),
// whatever time of day the seed runs; times already between 9:00 and 19:00 stay as they are
function officeTime(d, salt) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).format(d))
  if (hour >= 9 && hour < 19) return d
  const rand = seeded(`office-${salt}`)
  return new Date(new Date(`${pkDay(d)}T00:00:00+05:00`).getTime() + ((10 + int(rand, 0, 7)) * 60 + 15 * int(rand, 0, 3)) * 60_000)
}
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY)
const later = (a, b) => (new Date(a) > new Date(b) ? new Date(a) : new Date(b))
const earlier = (a, b) => (new Date(a) < new Date(b) ? new Date(a) : new Date(b))
// The Vite bookings go back ~3 years: keep the last 4 months as they are and fit the rest into 4–12 months
const squeeze = (d) => (d <= 120 ? d : Math.round(120 + ((d - 120) * 240) / 880))

// Small deterministic random from a string (same as the Vite app), so a reset rebuilds the same data
function seeded(str) {
  let h = 2166136261
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)]
const int = (rand, min, max) => min + Math.floor(rand() * (max - min + 1))
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`
const json = (v) => (v == null ? null : JSON.stringify(v))
const randomCode = () => crypto.randomBytes(16).toString("hex").slice(0, 20)

// ---------- source data ----------

function load(file) {
  const full = path.join(SOURCE, file)
  if (!existsSync(full)) throw new Error(`Demo source not found: ${full}`)
  return JSON.parse(readFileSync(full, "utf8"))
}
const mine = (file) => load(file).filter((r) => r.tenantId === VITE_TENANT)

// ---------- main ----------

const args = process.argv.slice(2)
const RESET = args.includes("--reset")
const CHECK = args.includes("--check")

try {
  if (CHECK) await check()
  else await run()
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await closeAll()
}

async function findDemoTenant() {
  const t = await platformDb()("tenants").where({ slug: SLUG }).whereNull("deletedAt").first()
  if (t && t.email !== OWNER_EMAIL) throw new Error(`A workspace with the short name "${SLUG}" exists (${t.code}) but isn't the demo workspace. Nothing was changed.`)
  return t ?? null
}

async function run() {
  let tenant = await findDemoTenant()
  if (tenant && !RESET) {
    const db = tenantDb(tenant)
    const done = (await db.schema.hasTable("settings")) && (await db("settings").where({ key: "demo_seeded_at" }).first("value"))
    console.log(
      done
        ? `The demo workspace already exists: ${tenant.code} ${tenant.name} (${tenant.dbName}). Nothing changed. Use --reset to rebuild it.`
        : `The demo workspace ${tenant.code} exists but its data didn't finish loading. Run with --reset to rebuild it.`,
    )
    return
  }
  if (tenant) await teardown(tenant)
  tenant = await createTenant(tenant)
  const db = tenantDb(tenant)
  const ids = await createPeople(tenant, db)
  await seedWorkspace(tenant, db, ids)
  await db("settings")
    .insert({ key: "demo_seeded_at", value: JSON.stringify(new Date().toISOString()), description: "Demo data loaded by yarn demo:seed" })
    .onConflict("key")
    .merge()
  console.log(`\n✓ Demo workspace ready: ${tenant.code} ${tenant.name} (${tenant.dbName})`)
  console.log(`  Sign in at portal.propflowapp.test as ${OWNER_EMAIL} (password: see the top of scripts/demo-seed.mjs)\n`)
  await check()
}

// Drop the demo database and remove the demo people; the tenant row (and its code) is kept
async function teardown(tenant) {
  console.log(`Resetting ${tenant.code} (${tenant.dbName})…`)
  const admin = provisionDb({ host: tenant.dbHost || undefined })
  try {
    await admin.raw("DROP DATABASE IF EXISTS ??", [tenant.dbName])
  } finally {
    await admin.destroy()
  }
  const auth = authDb()
  const users = await auth("users").where("email", "like", `%@${DOMAIN}`).select("id")
  const userIds = users.map((u) => u.id)
  // Demo users must not belong to any other workspace
  const elsewhere = userIds.length ? await auth("memberships").whereIn("userId", userIds).whereNot({ tenantId: tenant.id }).whereNull("deletedAt").first("id") : null
  if (elsewhere) throw new Error("A demo user belongs to another workspace; not removing demo users.")
  await auth("memberships").where({ tenantId: tenant.id }).delete()
  if (userIds.length) {
    for (const table of ["sessions", "loginHistory", "oneTimeCodes"])
      if (
        await auth.schema.hasColumn(
          table.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
          "user_id",
        )
      )
        await auth(table).whereIn("userId", userIds).delete()
    await auth("users").whereIn("id", userIds).delete()
  }
  await platformDb()("tenantApps").where({ tenantId: tenant.id }).delete()
  await platformDb()("subscriptions").where({ tenantId: tenant.id }).delete()
  await platformDb()("tenants").where({ id: tenant.id }).update({ status: "provisioning", ownerUserId: null, updatedAt: new Date() })
}

// The tenant record (new, or kept from before a reset), its apps (everything, Enterprise), a
// subscription, and its own database through the app's provisioning
async function createTenant(existing) {
  const platform = platformDb()
  const plan = await platform("plans").where({ code: "enterprise" }).first("id", "priceMonthly")
  if (!plan) throw new Error("No Enterprise plan in pf_platform. Run yarn db:seed first.")
  const yearly = Number((await platform("settings").where({ key: "yearly_months_charged" }).first("value"))?.value ?? 10)
  const periodEnd = new Date(NOW)
  periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  let tenant = existing
  if (!tenant) {
    tenant = await platform.transaction(async (trx) => {
      const code = await nextCode(trx, "tenant")
      const [id] = await trx("tenants").insert({
        code,
        slug: SLUG,
        name: COMPANY.name,
        legalName: COMPANY.legalName,
        ntn: COMPANY.ntn,
        city: COMPANY.city,
        address: COMPANY.address,
        phone: COMPANY.phone,
        email: OWNER_EMAIL,
        planId: plan.id,
        billingCycle: "yearly",
        status: "provisioning",
        currentPeriodEndsAt: periodEnd,
        dbName: tenantDbName(code),
        createdAt: daysAgo(370),
      })
      return trx("tenants").where({ id }).first()
    })
    console.log(`Created workspace ${tenant.code} (${tenant.dbName})`)
  }
  const apps = await platform("apps").whereNull("deletedAt").where({ isActive: true }).select("id")
  await platform("tenantApps").where({ tenantId: tenant.id }).delete()
  await platform("tenantApps").insert(apps.map((a) => ({ tenantId: tenant.id, appId: a.id, enabledAt: daysAgo(370) })))
  await platform("subscriptions").insert({
    tenantId: tenant.id,
    planId: plan.id,
    billingCycle: "yearly",
    price: Number(plan.priceMonthly) * yearly,
    startsAt: NOW,
    endsAt: periodEnd,
    status: "active",
    note: "Demo workspace (yarn demo:seed)",
  })
  const out = await provisionTenant(tenant.id, { finalStatus: "active", company: { name: COMPANY.name, city: COMPANY.city } })
  if (!out.ok) throw new Error(`Provisioning failed: ${out.error}`)
  await platform("tenants").where({ id: tenant.id }).update({ currentPeriodEndsAt: periodEnd, updatedAt: new Date() })
  return platform("tenants").where({ id: tenant.id }).first()
}

// Logins in pf_auth and memberships with the workspace's roles → { users: Map(viteId → { id, name }) }
async function createPeople(tenant, db) {
  const auth = authDb()
  const viteUsers = load("auth/users.json")
  const members = mine("master/members.json")
  const roles = Object.fromEntries((await db("roles").whereNull("deletedAt").select("id", "code")).map((r) => [r.code, r.id]))
  const passwordHash = await hashPassword(PASSWORD)
  const users = new Map()
  for (const [viteId, p] of Object.entries(PEOPLE)) {
    const v = viteUsers.find((u) => u.id === viteId)
    const m = members.find((x) => x.userId === viteId)
    const email = `${p.email ?? v.name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DOMAIN}`
    let row = await auth("users").where({ email }).first("id")
    if (!row) {
      const [id] = await auth("users").insert({
        name: v.name,
        email,
        phone: normalizePhone(v.phone),
        passwordHash,
        status: "active",
        emailVerifiedAt: daysAgo(m?.joinedDaysAgo ?? 365),
        passwordChangedAt: NOW,
        lastLoginAt: minutesAgo(m?.lastActiveMinutesAgo ?? 60),
        createdAt: daysAgo(Math.min(m?.joinedDaysAgo ?? 365, 400)),
      })
      row = { id }
    }
    if (!roles[p.role]) throw new Error(`No ${p.role} role in the workspace.`)
    const hasDefault = await auth("memberships").where({ userId: row.id, isDefault: true }).whereNull("deletedAt").first("id")
    await auth("memberships").insert({
      userId: row.id,
      tenantId: tenant.id,
      roleId: roles[p.role],
      status: "active",
      isDefault: !hasDefault,
      joinedAt: daysAgo(Math.min(m?.joinedDaysAgo ?? 365, 400)),
      createdAt: daysAgo(Math.min(m?.joinedDaysAgo ?? 365, 400)),
    })
    users.set(viteId, { id: row.id, name: v.name, email, phone: normalizePhone(v.phone), member: m, role: p.role, designation: p.designation, department: p.department })
  }
  const owner = users.get("USR-0006")
  await platformDb()("tenants").where({ id: tenant.id }).update({ ownerUserId: owner.id, createdBy: owner.id, updatedAt: new Date() })
  console.log(`People: ${users.size} logins (${OWNER_EMAIL} is the owner)`)
  return { users }
}

// ---------- everything inside the workspace ----------

async function seedWorkspace(tenant, db, { users }) {
  const owner = users.get("USR-0006")
  const ctx = { user: { id: owner.id } }
  const accountant = users.get("USR-0013")
  const uid = (viteId) => (viteId ? (users.get(viteId)?.id ?? null) : null)
  const userByName = (name) => [...users.values()].find((u) => u.name === name)?.id ?? null
  const counts = {}
  const bump = (k, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

  // ----- settings, chart of accounts, lookups -----
  const settings = {
    company_name: COMPANY.name,
    company_legal_name: COMPANY.legalName,
    company_address: COMPANY.address,
    company_city: COMPANY.city,
    company_phone: COMPANY.phone,
    company_email: COMPANY.email,
    company_ntn: COMPANY.ntn,
    company_strn: COMPANY.strn,
    company_secp: COMPANY.secp,
    company_website: COMPANY.website,
    setup_preferences_saved_at: daysAgo(365).toISOString(),
    setup_completed_at: daysAgo(365).toISOString(),
  }
  // The company logo (a skyline mark, drawn here so the demo needs no image files): setup is then fully done
  try {
    const { default: sharp } = await import("sharp")
    const { saveFile } = await import("../src/server/storage/index.js")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#0270D2"/>
      <g fill="#fff"><rect x="12" y="30" width="9" height="22" rx="1.5"/><rect x="23" y="18" width="10" height="34" rx="1.5"/>
      <rect x="35" y="24" width="8" height="28" rx="1.5"/><rect x="45" y="34" width="7" height="18" rx="1.5"/></g>
      <g fill="#0270D2"><rect x="26" y="22" width="4" height="3"/><rect x="26" y="28" width="4" height="3"/><rect x="26" y="34" width="4" height="3"/>
      <rect x="37.5" y="28" width="3" height="3"/><rect x="37.5" y="34" width="3" height="3"/><rect x="14.5" y="34" width="4" height="3"/></g>
      <rect x="10" y="52" width="44" height="2.5" rx="1.25" fill="#fff"/></svg>`
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer()
    settings.company_logo = await saveFile({ folder: `tenants/${tenant.code.toLowerCase()}/branding`, buffer, ext: "png", contentType: "image/png" })
    settings.company_logo_type = "image/png"
  } catch (e) {
    console.warn(`No demo logo (${e.message}); setup will ask for one.`)
  }
  await db("settings")
    .insert(Object.entries(settings).map(([key, value]) => ({ key, value: JSON.stringify(value), updatedAt: daysAgo(365), updatedBy: owner.id })))
    .onConflict("key")
    .merge(["value", "updatedAt", "updatedBy"])

  await db("accounts").where({ code: "1110" }).update({ isDefault: false })
  for (const [i, b] of BANKS.entries())
    await db("accounts").insert({
      code: b.code,
      name: b.name,
      type: "asset",
      parentCode: "1100",
      kind: "bank",
      isSystem: false,
      isDefault: Boolean(b.isDefault),
      bankName: b.bankName,
      accountTitle: b.title,
      accountNumber: b.number,
      iban: b.iban,
      branch: b.branch,
      openingBalance: 0,
      sortOrder: 1130 + i * 10,
      createdBy: owner.id,
      createdAt: daysAgo(366),
    })
  const accounts = Object.fromEntries((await db("accounts").whereNull("deletedAt").select("id", "code")).map((a) => [a.code, a.id]))

  for (const [i, [listKey, value, label]] of EXTRA_LOOKUPS.entries())
    await db("lookups")
      .insert({ listKey, value, label, isDefault: false, isActive: true, sortOrder: 500 + i * 10, createdBy: owner.id })
      .onConflict()
      .ignore()

  // ----- teams and member profiles -----
  const teams = new Map()
  const projectsVite = mine("estate/projects.json")
  for (const [i, t] of mine("master/teams.json").entries()) {
    const [id] = await db("teams").insert({
      name: t.name,
      color: t.color,
      description: t.description,
      leadUserId: uid(t.leadId),
      targetBookings: t.target.bookings,
      targetValue: t.target.value,
      sortOrder: (i + 1) * 10,
      createdBy: owner.id,
      createdAt: daysAgo(360),
    })
    teams.set(t.id, { id, projectIds: t.projectIds })
  }
  const dealersVite = mine("sales/dealers.json")
  const dealers = new Map()
  const bookingsVite = mine("sales/bookings.json")
  const DEALER_PEOPLE = { "DLR-001": "Imtiaz Hussain", "DLR-002": "Adnan Qureshi", "DLR-003": "Nadeem Akhtar", "DLR-004": "Farhan Siddiqui" }
  const DEALER_ADDRESS = {
    "DLR-001": "12-C, Commercial Area, DHA Phase 4, Lahore",
    "DLR-002": "Office 7, Siddique Trade Center, Gulberg, Lahore",
    "DLR-003": "45-A, Main Boulevard, Johar Town, Lahore",
    "DLR-004": "Office 3, Blue Area, Jinnah Avenue, Islamabad",
  }
  await db.transaction(async (trx) => {
    for (const [i, d] of dealersVite.entries()) {
      const pcts = bookingsVite.filter((b) => b.dealerId === d.id).map((b) => b.commissionPct)
      const mode = pcts.sort((a, b) => pcts.filter((x) => x === b).length - pcts.filter((x) => x === a).length)[0] ?? 2
      const code = await nextCode(trx, "dealer")
      const [id] = await trx("dealers").insert({
        code,
        name: d.name,
        contactName: DEALER_PEOPLE[d.id],
        phone: normalizePhone(d.phone),
        email: `${d.name.toLowerCase().replace(/[^a-z]+/g, "")}@example.com`,
        city: d.city,
        address: DEALER_ADDRESS[d.id],
        ntn: `${3000000 + i * 137731}-${i + 2}`,
        commissionPct: mode,
        notes: "Authorized dealer for Skyline projects",
        isActive: true,
        createdBy: owner.id,
        createdAt: daysAgo(380 - i * 30),
      })
      dealers.set(d.id, { id, code, name: d.name, pct: mode })
    }
  })
  bump("dealers", dealers.size)

  const memberIds = new Map()
  await db.transaction(async (trx) => {
    const ordered = [...users.entries()].sort((a, b) => (b[1].member?.joinedDaysAgo ?? 0) - (a[1].member?.joinedDaysAgo ?? 0))
    for (const [viteId, u] of ordered) {
      const m = u.member ?? {}
      const code = await nextCode(trx, "member")
      const [id] = await trx("members").insert({
        code,
        userId: u.id,
        teamId: m.teamId ? teams.get(m.teamId)?.id : null,
        dealerId: m.dealerId ? dealers.get(m.dealerId)?.id : null,
        designation: u.designation ?? m.designation ?? null,
        department: u.department ?? (m.department === "customer-services" ? "estate-office" : m.department) ?? null,
        joinedAt: daysAgo(Math.min(m.joinedDaysAgo ?? 365, 1500)),
        createdBy: owner.id,
        createdAt: daysAgo(Math.min(m.joinedDaysAgo ?? 365, 400)),
      })
      memberIds.set(viteId, id)
    }
  })
  bump("members", memberIds.size)
  bump("teams", teams.size)

  // ----- projects, phases, blocks, units -----
  const projects = new Map()
  const phases = new Map()
  const blocks = new Map()
  for (const [i, p] of projectsVite.entries()) {
    const [id] = await db("projects").insert({
      code: p.code,
      name: p.name,
      type: p.type,
      status: p.status,
      city: p.city,
      location: p.location,
      authority: p.authority,
      approval: p.approval,
      nocNumber: p.nocNumber,
      launchDate: p.launchDate,
      possessionDate: p.possessionDate,
      totalArea: p.totalArea.value,
      areaUnit: p.totalArea.unit,
      marlaSqft: p.marlaSqft,
      color: p.color.toLowerCase(),
      description: clean(p.description),
      amenities: json(p.amenities.map(clean)),
      sortOrder: (i + 1) * 10,
      createdBy: owner.id,
      createdAt: daysAgo(400),
    })
    projects.set(p.id, { id, code: p.code, name: p.name, location: p.location, city: p.city, authority: p.authority, nocNumber: p.nocNumber })
    for (const [j, ph] of p.phases.entries()) {
      const [phaseId] = await db("projectPhases").insert({
        projectId: id,
        name: ph.name,
        stage: ph.stage,
        status: ph.status,
        launchDate: ph.launchDate,
        possessionDate: ph.possessionDate,
        sortOrder: (j + 1) * 10,
        createdBy: owner.id,
        createdAt: daysAgo(400),
      })
      phases.set(ph.id, { id: phaseId, status: ph.status, projectId: id })
      for (const [k, bl] of ph.blocks.entries()) {
        const [blockId] = await db("projectBlocks").insert({ projectId: id, phaseId, name: bl.name, category: bl.category, sortOrder: (k + 1) * 10, createdBy: owner.id, createdAt: daysAgo(400) })
        blocks.set(bl.id, blockId)
      }
    }
  }
  for (const [k, t] of teams) {
    const vt = mine("master/teams.json").find((x) => x.id === k)
    await db("teams")
      .where({ id: t.id })
      .update({ projectIds: json(vt.projectIds.map((p) => projects.get(p).id)) })
  }
  bump("projects", projects.size)
  bump("phases", phases.size)
  bump("blocks", blocks.size)

  // ----- price lists (rates, premiums, charges, plans) -----
  const lists = new Map()
  const listsVite = mine("estate/price-lists.json").sort((a, b) => a.projectId.localeCompare(b.projectId) || a.version - b.version)
  await db.transaction(async (trx) => {
    for (const l of listsVite) {
      const plans = l.plans.map((p) => ({
        key: `p${p.id.split("-")[1]}`,
        name: p.name,
        downPaymentPct: p.downPaymentPct,
        installments: p.installments,
        frequency: p.frequency,
        balloonCount: p.balloonCount,
        balloonPct: p.balloonPct,
        possessionPct: p.possessionPct,
        discountPct: p.discountPct ?? 0,
        note: clean(p.note ?? ""),
      }))
      const code = await nextCode(trx, "price-list")
      const created = l.status === "draft" ? daysAgo(9) : l.status === "archived" ? daysAgo(390) : daysAgo(Math.max(20, Math.min(380, Math.round((TODAY - new Date(l.effectiveFrom)) / DAY) + 10)))
      const [id] = await trx("priceLists").insert({
        code,
        projectId: projects.get(l.projectId).id,
        version: l.version,
        name: clean(l.name),
        status: l.status,
        effectiveFrom: l.effectiveFrom,
        notes: clean(l.notes ?? null),
        floorRisePct: l.floorRisePct ?? 0,
        rates: json(l.rates.map((r) => ({ key: `r${r.id.split("-")[1]}`, type: r.type, category: r.category, sizeValue: r.size?.value ?? null, sizeUnit: r.size?.unit ?? null, rate: r.rate }))),
        premiums: json(l.premiums ?? []),
        charges: json((l.charges ?? []).map((c) => ({ key: `c${c.id.split("-")[1]}`, name: c.name, basis: c.basis, amount: c.amount, due: c.due }))),
        plans: json(plans),
        activatedBy: l.status === "active" || l.status === "archived" ? owner.id : null,
        activatedAt: l.status === "active" || l.status === "archived" ? created : null,
        createdBy: owner.id,
        createdAt: created,
      })
      lists.set(l.id, { id, plans, status: l.status, projectId: projects.get(l.projectId).id })
    }
  })
  bump("price lists", lists.size)

  // ----- bookings plan (worked out before anything is written, so every record's dates agree) -----
  const unitsVite = mine("estate/units.json")
  const unitById = new Map(unitsVite.map((u) => [u.id, u]))
  const contactsVite = mine("master/contacts.json")
  const contactById = new Map(contactsVite.map((c) => [c.id, c]))
  const leadsVite = mine("crm/leads.json")
  const requestsVite = mine("services/requests.json")
  const usedByRequests = new Set(requestsVite.map((r) => r.bookingId).filter(Boolean))

  const plansFor = (vb) => {
    const l = lists.get(vb.priceListId)
    return { list: l, plan: l.plans.find((p) => p.key === `p${vb.planId.split("-")[1]}`) }
  }
  const BANKS_FOR_CHEQUES = ["HBL", "MCB Bank", "UBL", "Allied Bank", "Bank Alfalah", "Meezan Bank", "Faysal Bank", "Askari Bank", "Bank Al Habib"]
  const accountFor = (method) => (method === "cash" ? accounts["1110"] : accounts["1130"])
  const refFor = (rand, method) =>
    method === "bank-transfer"
      ? `IBFT ${int(rand, 10000000, 99999999)}`
      : method === "jazzcash"
        ? `JC-${int(rand, 100000000, 999999999)}`
        : method === "easypaisa"
          ? `EP-${int(rand, 100000000, 999999999)}`
          : method === "pay-order"
            ? `PO ${int(rand, 100000, 999999)}`
            : method === "cash"
              ? `Receipt book ${int(rand, 1200, 4800)}`
              : null

  // Bookings that get canceled: older installment buyers who stopped paying, none used by Estate Management
  const cancelPicks = bookingsVite
    .filter((b) => b.status !== "token" && !usedByRequests.has(b.id) && b.planId !== "PP-1" && squeeze(b.bookingDaysAgo) > 150)
    .sort((a, b) => (a.behaviour === "defaulter" ? -1 : 1) - (b.behaviour === "defaulter" ? -1 : 1) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((b) => b.id)
  const CANCEL = {
    [cancelPicks[0]]: { daysAgo: 48, reason: "Buyer stopped paying after the down payment and asked to cancel", refundAfter: 9 },
    [cancelPicks[1]]: { daysAgo: 27, reason: "Buyer moved abroad and requested cancellation", refundAfter: 8 },
    [cancelPicks[2]]: { daysAgo: 6, reason: "Buyer could not arrange the balloon payments", refundAfter: null },
  }

  const plan = []
  for (const vb of bookingsVite) {
    const unit = unitById.get(vb.unitId)
    const { list, plan: p } = plansFor(vb)
    const rand = seeded(vb.id)
    const tokenAgo = vb.token ? squeeze(vb.token.daysAgo) : null
    const bookAgo = Math.max(squeeze(vb.bookingDaysAgo), tokenAgo ?? 0)
    const bookedAt = daysAgo(bookAgo, int(rand, 10, 17), int(rand, 0, 59))
    // A token holds the unit; the plan (and its down payment) starts when the token runs out
    const startDay = vb.status === "token" ? pkDay(addDays(NOW, Math.max(3, vb.token?.expiresInDays ?? 10))) : pkDay(bookedAt)
    const start = new Date(`${startDay}T00:00:00`)
    const sched = paymentSchedule(vb.price - (vb.extraDiscount ?? 0), p, start)
    const rows = sched.rows.map((r) => ({ ...r, dueDay: pkDay(r.dueDate), due: new Date(`${pkDay(r.dueDate)}T12:00:00+05:00`) }))
    const cancel = CANCEL[vb.id] ? { ...CANCEL[vb.id], at: daysAgo(CANCEL[vb.id].daysAgo, 15, 30) } : null
    // Payment habit: how far behind they are
    const age = bookAgo
    const lag = vb.behaviour === "on-time" ? 0 : Math.max(0, Math.min(vb.lagDays, age - 35))
    const payUntil = Math.min(NOW.getTime() - lag * DAY, cancel ? cancel.at.getTime() - DAY : Infinity)
    const receipts = []
    let tokenCredit = 0
    if (vb.token) {
      const at = daysAgo(tokenAgo ?? bookAgo, int(rand, 10, 16), int(rand, 0, 59))
      receipts.push({ at: later(at, bookedAt), amount: vb.token.amount, method: vb.token.method, notes: "Token" })
      tokenCredit = vb.token.amount
    }
    if (vb.status !== "token") {
      rows.forEach((r, i) => {
        const due = r.due.getTime()
        if (due > payUntil || r.kind === "possession") return
        const amount = i === 0 ? Math.max(0, r.amount - tokenCredit) : r.amount
        if (i === 0) tokenCredit = 0
        if (!amount) return
        const lateDays = vb.behaviour === "on-time" ? Math.floor(rand() * 6) : Math.floor(rand() * 25) + 5
        let at = new Date(due + lateDays * DAY + int(rand, -2, 5) * HOUR)
        if (at > REF) at = new Date(REF.getTime() - int(rand, 1, 6) * HOUR)
        if (cancel && at >= cancel.at) return
        const method = rand() < 0.75 ? vb.preferredMethod : pick(rand, ["bank-transfer", "cheque", "cash"])
        receipts.push({ at: later(at, bookedAt), amount, method, notes: r.label })
      })
    }
    for (const r of receipts) {
      const rr = seeded(`${vb.id}${r.notes}${r.amount}`)
      r.accountId = accountFor(r.method)
      r.reference = refFor(rr, r.method)
      if (r.method === "cheque") {
        r.chequeNo = String(int(rr, 10000000, 99999999))
        r.chequeBank = pick(rr, BANKS_FOR_CHEQUES)
        r.chequeDate = pkDay(r.at)
      }
      if (r.method === "pay-order") r.chequeBank = pick(rr, BANKS_FOR_CHEQUES)
      const clears = ["cheque", "pay-order"].includes(r.method)
      if (clears && NOW - r.at < 4 * DAY) r.status = "clearing"
      else {
        r.status = "cleared"
        r.clearedAt = clears ? capNow(addDays(r.at, 2)) : r.at
      }
    }
    plan.push({ vb, unit, list, plan: p, sched, rows, bookedAt, startDay, receipts, cancel, rand })
  }
  plan.sort((a, b) => a.bookedAt - b.bookedAt)

  // A few cheques bounced (most were replaced by a bank transfer a few days later)
  const chequePool = plan
    .filter((b) => !b.cancel)
    .flatMap((b) => b.receipts.filter((r) => r.method === "cheque" && r.status === "cleared" && NOW - r.at > 12 * DAY && NOW - r.at < 220 * DAY && r.notes !== "Token").map((r) => ({ b, r })))
    .sort((x, y) => seeded(x.b.vb.id + x.r.notes)() - seeded(y.b.vb.id + y.r.notes)())
  for (const [i, { b, r }] of chequePool.slice(0, 6).entries()) {
    r.status = "bounced"
    r.bouncedAt = capNow(addDays(r.at, 3))
    delete r.clearedAt
    r.bouncedNote = "Insufficient funds"
    if (i < 4)
      b.receipts.push({
        at: capNow(addDays(r.at, 9)),
        amount: r.amount,
        method: "bank-transfer",
        accountId: accounts["1130"],
        reference: refFor(seeded(r.chequeNo), "bank-transfer"),
        status: "cleared",
        clearedAt: capNow(addDays(r.at, 9)),
        notes: `${r.notes} (replaces bounced cheque ${r.chequeNo})`,
      })
  }
  // Money milestones per booking: when the down (or full) payment and the whole price were in
  for (const b of plan) {
    b.receipts.sort((x, y) => x.at - y.at)
    const cleared = b.receipts.filter((r) => r.status === "cleared").sort((x, y) => x.clearedAt - y.clearedAt)
    let sum = 0
    const down = b.rows[0].amount
    for (const r of cleared) {
      sum += r.amount
      if (!b.downPaidAt && sum >= down) b.downPaidAt = r.clearedAt
      if (!b.fullPaidAt && sum >= b.sched.net) b.fullPaidAt = r.clearedAt
    }
    b.received = sum
  }

  // ----- Estate Management requests: which file each one is on -----
  const planByVite = new Map(plan.map((b) => [b.vb.id, b]))
  // Possession only on Phase 1 (open for possession), and completed ones need files paid in full
  const phase1 = (b) => phases.get(b.unit.phaseId)?.status === "possession"
  const takenForPossession = new Set()
  const possessionFiles = plan.filter((b) => !b.cancel && phase1(b) && b.vb.status === "allotted" && b.fullPaidAt && NOW - b.fullPaidAt > 20 * DAY)
  for (const r of requestsVite.filter((x) => x.type === "possession").sort((a, b) => b.createdMinutesAgo - a.createdMinutesAgo)) {
    const own = planByVite.get(r.bookingId)
    const okFile = (b) => b && !takenForPossession.has(b.vb.id) && phase1(b) && (r.status !== "completed" || possessionFiles.includes(b))
    let b = okFile(own) ? own : (possessionFiles.find((x) => okFile(x) && NOW - x.fullPaidAt > r.createdMinutesAgo * 60_000 + 5 * DAY) ?? possessionFiles.find(okFile))
    if (!b && r.status !== "completed") b = plan.find((x) => okFile(x) && x.vb.status === "allotted")
    if (b) {
      takenForPossession.add(b.vb.id)
      r.bookingId = b.vb.id
      r.unitId = b.vb.unitId
      r.contactId = b.vb.contactId
    }
  }

  // ----- contacts -----
  // When each contact first appears (their lead or booking), so no record predates its contact
  const firstSeen = new Map()
  const seen = (cid, at) => cid && (!firstSeen.has(cid) || at < firstSeen.get(cid)) && firstSeen.set(cid, at)
  for (const b of plan) seen(b.vb.contactId, addDays(b.bookedAt, -10))
  for (const l of leadsVite) seen(l.contactId, minutesAgo(l.createdMinutesAgo))
  const contacts = new Map()
  const usedCnic = new Set()
  const emailOf = (e) => (e ? `${e.split("@")[0]}@example.com` : null)
  await db.transaction(async (trx) => {
    const ordered = [...contactsVite].sort((a, b) => b.createdMinutesAgo - a.createdMinutesAgo)
    for (const c of ordered) {
      const overseas = c.city && !["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Gujranwala", "Sialkot", "Peshawar"].includes(c.city)
      const cnic = c.cnic && !usedCnic.has(c.cnic) ? c.cnic : null
      if (cnic) usedCnic.add(cnic)
      const created = earlier(minutesAgo(Math.min(c.createdMinutesAgo, 390 * 1440)), firstSeen.get(c.id) ?? NOW)
      const code = await nextCode(trx, "contact")
      const [id] = await trx("contacts").insert({
        code,
        kind: c.company && c.company === c.name ? "company" : "person",
        name: c.name,
        phone: normalizePhone(c.phone),
        whatsapp: c.whatsapp ?? true,
        email: emailOf(c.email),
        cnic,
        city: c.city === "Abroad" ? null : c.city,
        overseas: Boolean(overseas),
        address: clean(c.address),
        company: clean(c.company),
        designation: c.designation,
        guardianRelation: c.guardian?.relation ?? null,
        guardianName: c.guardian?.name ?? null,
        notes: clean(c.notes || null),
        createdBy: owner.id,
        createdAt: created,
      })
      contacts.set(c.id, { id, name: c.name, phone: normalizePhone(c.phone), city: c.city, overseas: Boolean(overseas), raw: c })
    }
  })
  const link = (trx, contactId, type, id, role, at) => trx("contactLinks").insert({ contactId, linkableType: type, linkableId: id, role, createdBy: owner.id, createdAt: at })
  // Staff and dealer firms are contacts too
  for (const c of contactsVite) {
    const ct = contacts.get(c.id)
    if (c.userId && memberIds.has(c.userId)) await link(db, ct.id, "member", memberIds.get(c.userId), c.types.includes("agent") ? "agent" : "employee", daysAgo(360))
    if (c.dealerId && dealers.has(c.dealerId)) await link(db, ct.id, "dealer", dealers.get(c.dealerId).id, "dealer", daysAgo(360))
  }

  // Contacts for people the generated leads are about (older enquiries that didn't buy)
  const FIRST = [
    "Ahmed",
    "Ali",
    "Usman",
    "Hassan",
    "Bilal",
    "Farhan",
    "Imran",
    "Kashif",
    "Naveed",
    "Omer",
    "Saad",
    "Waqas",
    "Zeeshan",
    "Fahad",
    "Junaid",
    "Ayesha",
    "Sana",
    "Hina",
    "Mehreen",
    "Rabia",
    "Nida",
    "Saima",
    "Amna",
    "Fatima",
    "Sidra",
  ]
  const LAST = ["Khan", "Malik", "Butt", "Chaudhry", "Sheikh", "Qureshi", "Rana", "Mirza", "Siddiqui", "Javed", "Iqbal", "Hussain", "Akhtar", "Raza", "Abbasi", "Gill", "Bajwa", "Cheema"]
  const OLD_SOURCES = ["facebook-ads", "facebook-ads", "instagram", "property-portal", "property-portal", "google-ads", "walk-in", "customer-referral", "phone", "expo", "sms", "dealer", "site-office"]

  // ----- units -----
  const units = new Map()
  const bookingOfUnit = new Map(plan.map((b) => [b.vb.unitId, b]))
  const unitSeq = {}
  await db.transaction(async (trx) => {
    for (const u of unitsVite) {
      const project = projectsVite.find((p) => p.id === u.projectId)
      const b = bookingOfUnit.get(u.id)
      let status = "available"
      if (b && !b.cancel) status = b.vb.status === "allotted" && b.downPaidAt ? "sold" : "booked"
      else if (!b && ["on-hold", "blocked"].includes(u.status)) status = u.status
      const marla = u.size.unit === "marla" ? u.size.value : u.size.unit === "kanal" ? u.size.value * 20 : null
      const hold = status === "on-hold" && u.hold ? u.hold : null
      const holdReason = hold ? (/token/i.test(hold.reason) ? "token" : /visit/i.test(hold.reason) ? "site-visit" : /dealer/i.test(hold.reason) ? "dealer" : "management") : null
      const code = u.id.replace(/^U-/, "")
      unitSeq[project.code] = Math.max(unitSeq[project.code] ?? 0, Number(code.split("-")[1]))
      const [id] = await trx("units").insert({
        code,
        projectId: projects.get(u.projectId).id,
        phaseId: phases.get(u.phaseId).id,
        blockId: blocks.get(u.blockId),
        number: u.number,
        type: u.type,
        category: u.category,
        sizeValue: u.size.value,
        sizeUnit: u.size.unit,
        areaSqft: u.areaSqft,
        street: u.street ?? null,
        dimensions: u.dimensions ?? null,
        floor: u.floor ?? null,
        bedrooms: u.bedrooms ?? null,
        features: json(u.features ?? []),
        premiums: json(u.premiums ?? []),
        basePrice: u.basePrice,
        baseRate: Math.round((u.basePrice / (marla ?? u.areaSqft)) * 100) / 100,
        price: u.price,
        status,
        dealerId: u.allocatedTo && dealers.has(u.allocatedTo) ? dealers.get(u.allocatedTo).id : null,
        holdBy: hold ? (userByName(hold.by) ?? owner.id) : null,
        holdReason,
        holdExpiresAt: hold ? new Date(NOW.getTime() + (hold.expiresInHours ?? 48) * HOUR) : null,
        blockReason: status === "blocked" ? "Reserved by management for the authority's share" : null,
        createdBy: owner.id,
        createdAt: daysAgo(395),
      })
      units.set(u.id, id)
    }
    for (const [prefix, n] of Object.entries(unitSeq))
      await trx("sequences")
        .insert({ key: `unit:${prefix}`, prefix, format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", nextValue: n + 1 })
        .onConflict("key")
        .merge(["nextValue"])
  })
  bump("units", units.size)

  // ----- campaigns, lead forms, landing pages -----
  const campaigns = new Map()
  const at0 = (offset) => (offset == null ? null : pkDay(addDays(TODAY, offset)))
  await db.transaction(async (trx) => {
    for (const c of mine("campaigns/campaigns.json")) {
      const code = await nextCode(trx, "campaign")
      const [id] = await trx("campaigns").insert({
        code,
        name: clean(c.name),
        objective: c.objective,
        projectId: c.projectId ? projects.get(c.projectId).id : null,
        status: c.status,
        startDate: at0(c.startOffsetDays),
        endDate: at0(c.endOffsetDays),
        ownerId: uid(c.ownerId),
        audience: clean(c.audience),
        offer: clean(c.offer) || null,
        notes: clean(c.description) || null,
        channels: json(c.channels.map((ch) => ({ ...ch, channel: SOURCE_MAP[ch.channel] ?? ch.channel }))),
        goals: json(c.goals),
        createdBy: uid(c.ownerId),
        createdAt: daysAgo(-c.createdOffsetDays, 12),
      })
      campaigns.set(c.id, { id, projectId: c.projectId })
    }
  })
  const forms = new Map()
  await db.transaction(async (trx) => {
    for (const f of mine("campaigns/forms.json")) {
      const code = await nextCode(trx, "lead-form")
      const [id] = await trx("leadForms").insert({
        code,
        name: clean(f.name),
        campaignId: f.campaignId ? campaigns.get(f.campaignId).id : null,
        projectId: f.projectId ? projects.get(f.projectId).id : null,
        status: f.status,
        fields: json(f.fields.map((x) => ({ ...x, label: clean(x.label) }))),
        settings: json({ ...f.settings, channel: SOURCE_MAP[f.settings.channel] ?? f.settings.channel, whatsapp: f.settings.whatsapp ? normalizePhone(f.settings.whatsapp) : "" }),
        views: f.views,
        createdBy: owner.id,
        createdAt: daysAgo(-f.createdOffsetDays, 12),
      })
      forms.set(f.id, { id, campaignId: f.campaignId })
    }
  })
  const pages = new Map()
  const types = (await db("lookups").where({ listKey: "unit-type" }).select("value", "label")).reduce((m, t) => ({ ...m, [t.value]: t.label }), {})
  await db.transaction(async (trx) => {
    for (const lp of mine("campaigns/landing-pages.json")) {
      const pr = lp.projectId ? projects.get(lp.projectId) : null
      const camp = mine("campaigns/campaigns.json").find((c) => c.id === lp.campaignId)
      const vars = {
        project: pr?.name ?? "Our project",
        location: [pr?.location, pr?.city].filter(Boolean).join(", ") || "the city",
        city: pr?.city ?? "",
        authority: pr?.authority === "LDA" ? "Lahore Development Authority" : (pr?.authority ?? "the authority"),
        noc: pr?.nocNumber ?? "",
        workspace: COMPANY.name,
      }
      let sections = fillPlaceholders(templateSections(lp.templateId), vars)
      const rows = pr ? await priceRows(trx, pr.id, types) : []
      if (rows.length) sections = sections.map((s) => (s.type === "pricing" ? { ...s, rows } : s))
      const code = await nextCode(trx, "landing-page")
      const [id] = await trx("landingPages").insert({
        code,
        name: clean(lp.name),
        slug: lp.slug,
        template: lp.templateId,
        campaignId: lp.campaignId ? campaigns.get(lp.campaignId).id : null,
        projectId: pr?.id ?? null,
        formId: lp.formId ? forms.get(lp.formId).id : null,
        status: lp.status,
        theme: json({ ...THEME_DEFAULTS, accent: lp.accent, phone: COMPANY.phone, whatsapp: "+923001234567" }),
        seo: json({ title: `${clean(lp.name)} | ${COMPANY.name}`, description: clean(camp?.offer || camp?.audience || "").slice(0, 300), image: "" }),
        sections: json(sections),
        views: lp.views,
        publishedAt: lp.publishedOffsetDays != null ? daysAgo(-lp.publishedOffsetDays, 12) : null,
        createdBy: owner.id,
        createdAt: daysAgo(-lp.createdOffsetDays, 11),
      })
      pages.set(lp.id, { id, formId: lp.formId })
    }
  })
  bump("campaigns", campaigns.size)
  bump("lead forms", forms.size)
  bump("landing pages", pages.size)

  // ----- CRM leads and activities -----
  // Vite leads (the last two months), a lead behind every booking, and older enquiries that didn't buy
  const leadRows = []
  const bookingOfLead = new Map(plan.filter((b) => b.vb.leadId).map((b) => [b.vb.leadId, b]))
  const activitiesVite = mine("crm/activities.json")
  const pageOfForm = (formId) => [...pages.values()].find((p) => p.formId === formId)?.id ?? null
  const priorityOf = (l) => (l.priority === "warm" ? "moderate" : l.priority === "hot" ? (["negotiation", "booked"].includes(l.status) ? "very-hot" : "hot") : l.status === "lost" ? "very-cold" : "cold")
  const OUTCOME = (text, status) => {
    if (!text) return status === "missed" ? null : null
    if (/no answer/i.test(text)) return "no-answer"
    if (/call back/i.test(text)) return "call-back"
    if (/not interested|did not show/i.test(text)) return status === "missed" ? null : "not-interested"
    return "interested"
  }
  for (const l of leadsVite) {
    const b = bookingOfLead.get(l.id)
    let created = minutesAgo(l.createdMinutesAgo)
    let shift = 0
    if (b && created > addDays(b.bookedAt, -12)) {
      shift = created - addDays(b.bookedAt, -14)
      created = addDays(b.bookedAt, -14)
    }
    const acts = activitiesVite
      .filter((a) => a.leadId === l.id)
      .map((a) => {
        const at = a.status === "planned" && a.minutesAgo < 0 ? minutesAgo(a.minutesAgo) : new Date(minutesAgo(a.minutesAgo).getTime() - shift)
        return {
          type: a.type,
          status: a.status,
          at: later(at, created),
          by: uid(a.by),
          outcome: OUTCOME(a.outcome, a.status),
          notes: clean([a.outcome, a.notes].filter(Boolean).join(". ")) || null,
          projectId: a.projectId ? projects.get(a.projectId).id : null,
        }
      })
    const interest = l.interest ?? {}
    const contact = contacts.get(l.contactId)
    leadRows.push({
      at: created,
      contactId: contact?.id ?? null,
      row: {
        name: l.name,
        phone: normalizePhone(l.phone),
        whatsapp: l.whatsapp,
        email: emailOf(l.email),
        city: l.city === "Abroad" ? null : l.city,
        overseas: l.overseas,
        source: SOURCE_MAP[l.source] ?? l.source,
        status: l.status,
        priority: priorityOf(l),
        lossReason: l.status === "lost" ? (l.lossReason ?? "just-browsing") : null,
        projectId: interest.projectId ? projects.get(interest.projectId).id : null,
        unitType: interest.unitType ?? null,
        sizeValue: interest.size?.value ?? null,
        sizeUnit: interest.size?.unit ?? null,
        budgetMin: interest.budgetMin ?? null,
        budgetMax: interest.budgetMax ?? null,
        paymentPlan: interest.paymentPlan ?? null,
        purpose: interest.purpose ?? null,
        notes: clean(l.notes) || null,
        assignedTo: uid(l.assignedTo),
        teamId: l.teamId ? teams.get(l.teamId)?.id : null,
        firstContactAt: l.firstContactMinutesAgo != null ? new Date(minutesAgo(l.firstContactMinutesAgo).getTime() - shift) : null,
        lastContactAt: l.lastContactMinutesAgo != null ? earlier(new Date(minutesAgo(l.lastContactMinutesAgo).getTime() - shift), b ? b.bookedAt : NOW) : null,
        closedAt: l.status === "booked" ? (b?.bookedAt ?? minutesAgo(l.lastContactMinutesAgo ?? 60)) : l.status === "lost" ? minutesAgo(l.lastContactMinutesAgo ?? 60) : null,
        campaignId: l.campaignId ? campaigns.get(l.campaignId).id : null,
        formId: l.formId ? forms.get(l.formId).id : null,
        landingPageId: l.formId ? pageOfForm(l.formId) : null,
        createdBy: uid(l.assignedTo) ?? owner.id,
      },
      acts,
      booking: b ?? null,
    })
  }
  const teamOfUser = (userId) => {
    const viteId = [...users.entries()].find(([, u]) => u.id === userId)?.[0]
    const t = users.get(viteId)?.member?.teamId
    return t ? teams.get(t)?.id : null
  }
  for (const b of plan.filter((x) => !x.vb.leadId)) {
    const rand = seeded(`lead-${b.vb.id}`)
    const c = contacts.get(b.vb.contactId)
    const created = later(addDays(b.bookedAt, -int(rand, 8, 40)), daysAgo(375))
    const agent = uid(b.vb.agentId)
    const source = b.vb.dealerId
      ? "dealer"
      : pick(
          rand,
          OLD_SOURCES.filter((s) => s !== "dealer"),
        )
    const project = b.list.projectId
    const visit = addDays(created, int(rand, 2, 6))
    leadRows.push({
      at: created,
      contactId: c?.id ?? null,
      row: {
        name: c?.name ?? "Buyer",
        phone: c?.phone ?? `+923${int(rand, 0, 4)}${int(rand, 10000000, 99999999)}`,
        whatsapp: true,
        email: emailOf(c?.raw.email),
        city: c?.city === "Abroad" ? null : (c?.city ?? "Lahore"),
        overseas: c?.overseas ?? false,
        source,
        status: "booked",
        priority: "very-hot",
        projectId: project,
        unitType: b.unit.type,
        sizeValue: b.unit.size.value,
        sizeUnit: b.unit.size.unit,
        budgetMin: Math.round((b.sched.net * 0.85) / 100000) * 100000,
        budgetMax: Math.round((b.sched.net * 1.1) / 100000) * 100000,
        paymentPlan: isCashPlan(b.plan) ? "cash" : "installments",
        purpose: rand() < 0.6 ? "investment" : "living",
        notes: null,
        assignedTo: agent,
        teamId: teamOfUser(agent),
        firstContactAt: new Date(created.getTime() + int(rand, 10, 300) * 60_000),
        lastContactAt: b.bookedAt,
        closedAt: b.bookedAt,
        createdBy: agent ?? owner.id,
      },
      acts: [
        { type: "call", status: "done", at: new Date(created.getTime() + 2 * HOUR), by: agent, outcome: "interested", notes: "Shared the price list and payment plans", projectId: null },
        { type: "site-visit", status: "done", at: later(earlier(visit, addDays(b.bookedAt, -1)), created), by: agent, outcome: "interested", notes: "Visited the site with family", projectId: project },
        { type: "meeting", status: "done", at: addDays(b.bookedAt, -1), by: agent, outcome: "interested", notes: "Finalized the unit and payment plan at the sales office", projectId: null },
      ],
      booking: b,
    })
  }
  // Older enquiries (3–12 months ago) that went nowhere, so the CRM history reaches back a year
  const agents = ["USR-0007", "USR-0008", "USR-0009", "USR-0010", "USR-0011", "USR-0012", "USR-0004"]
  const LOSS = ["budget", "location", "competitor", "payment-plan", "not-reachable", "just-browsing", "noc"]
  for (let month = 3; month <= 12; month++) {
    const rand = seeded(`old-${month}`)
    const n = int(rand, 6, 11)
    for (let i = 0; i < n; i++) {
      const created = daysAgo(month * 30 - int(rand, 0, 29), int(rand, 9, 20), int(rand, 0, 59))
      const name = `${pick(rand, FIRST)} ${pick(rand, LAST)}`
      const phone = `+923${int(rand, 0, 4)}${int(rand, 10000000, 99999999)}`
      const agent = uid(pick(rand, agents))
      const projectVite = pick(rand, ["PRJ-001", "PRJ-001", "PRJ-002", "PRJ-003"])
      const unitType = projectVite === "PRJ-001" ? pick(rand, ["plot", "plot", "file", "house"]) : projectVite === "PRJ-002" ? "apartment" : pick(rand, ["shop", "office"])
      const archived = rand() < 0.35
      leadRows.push({
        at: created,
        contactId: null,
        newContact: { name, phone, city: pick(rand, ["Lahore", "Lahore", "Lahore", "Gujranwala", "Sialkot", "Islamabad", "Faisalabad"]) },
        row: {
          name,
          phone,
          whatsapp: true,
          email: null,
          city: null,
          overseas: rand() < 0.1,
          source: pick(rand, OLD_SOURCES),
          status: "lost",
          priority: pick(rand, ["cold", "very-cold", "moderate"]),
          lossReason: pick(rand, LOSS),
          projectId: projects.get(projectVite).id,
          unitType,
          budgetMin: null,
          budgetMax: null,
          paymentPlan: rand() < 0.7 ? "installments" : "cash",
          purpose: rand() < 0.6 ? "investment" : "living",
          assignedTo: agent,
          teamId: teamOfUser(agent),
          firstContactAt: new Date(created.getTime() + int(rand, 15, 600) * 60_000),
          lastContactAt: addDays(created, int(rand, 3, 20)),
          closedAt: addDays(created, int(rand, 5, 25)),
          archivedAt: archived ? addDays(created, 40) : null,
          archivedBy: archived ? agent : null,
          createdBy: agent,
        },
        acts: [
          { type: "call", status: "done", at: new Date(created.getTime() + HOUR), by: agent, outcome: "interested", notes: "Discussed budget and sizes", projectId: null },
          { type: "whatsapp", status: "done", at: addDays(created, 2), by: agent, outcome: "call-back", notes: "Shared inventory on WhatsApp", projectId: null },
          { type: "call", status: "done", at: addDays(created, int(rand, 4, 15)), by: agent, outcome: pick(rand, ["not-interested", "no-answer"]), notes: null, projectId: null },
        ],
      })
    }
  }
  leadRows.sort((a, b) => a.at - b.at)
  const leadIdOfBooking = new Map()
  await db.transaction(async (trx) => {
    for (const l of leadRows) {
      let contactId = l.contactId
      if (!contactId && l.newContact) {
        const code = await nextCode(trx, "contact")
        ;[contactId] = await trx("contacts").insert({ code, kind: "person", name: l.newContact.name, phone: l.newContact.phone, whatsapp: true, city: l.newContact.city, createdBy: owner.id, createdAt: l.at })
        l.row.city = l.newContact.city
      }
      const code = await nextCode(trx, "lead")
      const [id] = await trx("leads").insert({ ...l.row, code, createdAt: l.at, updatedAt: l.row.lastContactAt ?? l.at })
      if (contactId) await link(trx, contactId, "lead", id, "lead", l.at)
      if (l.booking) leadIdOfBooking.set(l.booking.vb.id, id)
      const acts = l.acts.map((a) => ({
        leadId: id,
        type: a.type,
        status: a.status === "planned" && a.at < NOW - 2 * DAY && l.row.status === "booked" ? "done" : a.status,
        at: a.status === "planned" ? officeTime(a.at, `${id}-${a.type}`) : a.at,
        doneAt: a.status === "done" ? a.at : null,
        by: a.by,
        outcome: a.outcome,
        notes: a.notes,
        projectId: a.projectId,
        createdBy: a.by ?? owner.id,
        createdAt: a.status === "planned" ? earlier(a.at, NOW) : a.at,
      }))
      if (acts.length) await trx("leadActivities").insert(acts)
      bump("lead activities", acts.length)
    }
  })
  bump("leads", leadRows.length)
  // A couple of assignment rules, so CRM › Assignment rules isn't empty
  await db("leadAssignmentRules").insert([
    { name: "Skyline Heights enquiries", sortOrder: 10, isActive: true, conditions: json({ projects: ["SKH"] }), assignTo: "team", teamId: [...teams.values()][1].id, createdBy: owner.id, createdAt: daysAgo(200) },
    { name: "Overseas buyers", sortOrder: 20, isActive: true, conditions: json({ overseas: true }), assignTo: "agent", agentId: uid("USR-0010"), createdBy: owner.id, createdAt: daysAgo(180) },
    {
      name: "Everyone else in turns",
      sortOrder: 30,
      isActive: true,
      conditions: json({}),
      assignTo: "agents",
      agentIds: json(["USR-0008", "USR-0009", "USR-0011", "USR-0012"].map(uid)),
      createdBy: owner.id,
      createdAt: daysAgo(180),
    },
  ])

  // ----- bookings, schedules, payments -----
  const bookingIds = new Map()
  await db.transaction(async (trx) => {
    for (const b of plan) {
      const vb = b.vb
      const contact = contacts.get(vb.contactId)
      const agent = uid(vb.agentId)
      const code = await nextCode(trx, "booking", {}, b.bookedAt)
      const listRow = lists.get(vb.priceListId)
      const [id] = await trx("bookings").insert({
        code,
        leadId: leadIdOfBooking.get(vb.id) ?? null,
        unitId: units.get(vb.unitId),
        projectId: listRow.projectId,
        contactId: contact.id,
        customerName: contact.name,
        customerPhone: contact.phone,
        kind: vb.status === "token" ? "token" : "booking",
        stage: vb.status === "token" ? "booking-kyc" : "active",
        agreedPrice: vb.price,
        listPrice: vb.price,
        tokenAmount: vb.token?.amount ?? null,
        tokenDueDate: vb.status === "token" && vb.token?.expiresInDays != null ? pkDay(addDays(NOW, vb.token.expiresInDays)) : null,
        plan: json(b.plan),
        planStart: b.startDay,
        priceListId: listRow.id,
        planDiscount: b.sched.discount,
        extraDiscount: vb.extraDiscount ?? 0,
        netPrice: b.sched.net,
        schedule: "plan",
        installments: b.rows.length,
        firstDueDate: b.rows[0].dueDay,
        status: "current",
        agentId: agent,
        soldBy: agent,
        dealerId: vb.dealerId ? dealers.get(vb.dealerId).id : null,
        commissionPct: vb.commissionPct,
        nominee: json(vb.nominee),
        kycAt: b.bookedAt,
        bookedAt: b.bookedAt,
        createdBy: agent ?? owner.id,
        createdAt: b.bookedAt,
      })
      b.id = id
      b.code = code
      bookingIds.set(vb.id, id)
      await link(trx, contact.id, "booking", id, "customer", b.bookedAt)
      await trx("bookingInstallments").insert(
        b.rows.map((r) => ({
          bookingId: id,
          number: r.no,
          kind: r.kind === "down" && b.plan.downPaymentPct >= 100 ? "full" : r.kind,
          label: r.label,
          dueDate: r.dueDay,
          amount: r.amount,
          status: "due",
          createdBy: agent ?? owner.id,
          createdAt: b.bookedAt,
        })),
      )
    }
  })
  bump("bookings", plan.length)
  bump(
    "installments",
    plan.reduce((s, b) => s + b.rows.length, 0),
  )

  // Payments, in the order they came in (receipt numbers follow the date)
  const allReceipts = plan.flatMap((b) => b.receipts.map((r) => ({ ...r, b }))).sort((x, y) => x.at - y.at)
  await db.transaction(async (trx) => {
    for (const r of allReceipts) {
      const code = await nextCode(trx, "receipt", {}, r.at)
      const by = uid(r.b.vb.agentId) ?? owner.id
      const [id] = await trx("receipts").insert({
        code,
        bookingId: r.b.id,
        receivedOn: r.at,
        amount: r.amount,
        method: r.method,
        accountId: r.accountId,
        reference: r.reference ?? null,
        chequeNo: r.chequeNo ?? null,
        chequeBank: r.chequeBank ?? null,
        chequeDate: r.chequeDate ?? null,
        status: r.status,
        notes: r.bouncedNote ? `${r.notes}. Bounced: ${r.bouncedNote}` : r.notes,
        clearedAt: r.clearedAt ?? null,
        bouncedAt: r.bouncedAt ?? null,
        statusBy: r.status === "cleared" || r.status === "bounced" ? accountant.id : null,
        createdBy: by,
        createdAt: r.at,
      })
      const orig = r.b.receipts.find((x) => x.at === r.at && x.amount === r.amount && x.notes === r.notes)
      orig.id = id
      orig.code = code
    }
  })
  bump("receipts", allReceipts.length)

  // Allotment letters (once the down payment cleared), handover for files paid in full
  const allotments = plan.filter((b) => b.vb.status === "allotted" && b.downPaidAt && !b.cancel)
  for (const b of allotments) {
    const vite = b.vb.allotment ? daysAgo(squeeze(b.vb.allotment.daysAgo), 12) : NOW
    b.allottedAt = capNow(later(vite, addDays(b.downPaidAt, 2)))
  }
  allotments.sort((a, b) => a.allottedAt - b.allottedAt)
  await db.transaction(async (trx) => {
    for (const b of allotments) {
      const no = await nextCode(trx, "allotment", {}, b.allottedAt)
      b.allotmentNo = no
      // Ready for handover: paid in full, in a phase that's open for possession
      const handover = b.fullPaidAt && phase1(b) ? later(addDays(b.fullPaidAt, 5), addDays(b.allottedAt, 1)) : null
      b.handoverAt = handover && handover <= REF ? handover : null
      await trx("bookings")
        .where({ id: b.id })
        .update({ allotmentNo: no, allottedAt: b.allottedAt, allottedBy: owner.id, ...(b.handoverAt ? { stage: "handover", handoverAt: b.handoverAt } : {}) })
    }
  })
  bump("allotments", allotments.length)

  // One booking on hold (buyer abroad, documents pending)
  const onHold = plan.find((b) => !b.cancel && b.vb.behaviour === "late" && !usedByRequests.has(b.vb.id) && !b.allotmentNo)
  if (onHold) await db("bookings").where({ id: onHold.id }).update({ status: "on-hold" })

  // ----- Estate Management requests -----
  const requests = []
  for (const r of requestsVite) {
    const b = r.bookingId ? planByVite.get(r.bookingId) : null
    let created = minutesAgo(r.createdMinutesAgo)
    let shift = 0
    if (b && created < addDays(b.bookedAt, 10)) {
      shift = addDays(b.bookedAt, 10) - created
      if (created.getTime() + shift > REF.getTime() - HOUR) shift = REF.getTime() - HOUR - created.getTime()
      created = new Date(created.getTime() + shift)
    }
    const t = (m) => (m == null ? null : capNow(new Date(minutesAgo(m).getTime() + shift)))
    requests.push({ r, b, created, t })
  }
  requests.sort((a, b) => a.created - b.created)
  const feeRequests = []
  const possessionDone = []
  await db.transaction(async (trx) => {
    // Numbers issued in date order
    const issued = []
    for (const q of requests) {
      const { r } = q
      if (r.type === "ndc" && r.status === "completed") issued.push({ q, key: "ndc", at: q.t(r.ndc?.issuedMinutesAgo ?? r.closedMinutesAgo) })
      if (r.type === "transfer" && r.status === "completed") issued.push({ q, key: "transfer-letter", at: q.t(r.transfer?.completedMinutesAgo ?? r.closedMinutesAgo) })
      if (r.type === "possession" && r.status === "completed") issued.push({ q, key: "possession-letter", at: q.t(r.possession?.letterMinutesAgo ?? r.closedMinutesAgo) })
    }
    issued.sort((a, b) => a.at - b.at)
    for (const x of issued) x.q.number = await nextCode(trx, x.key, {}, x.at)

    for (const q of requests) {
      const { r, b, created, t } = q
      const closedAt = t(r.closedMinutesAgo)
      const contact = r.contactId ? contacts.get(r.contactId) : null
      let data = {}
      if (r.type === "transfer") {
        const toRaw = r.transfer?.to
        if (r.status === "completed") {
          const c = contact?.raw
          data = {
            to: { name: c?.name, phone: contact?.phone, cnic: c?.cnic, relation: c?.guardian?.relation, guardian: c?.guardian?.name, address: c?.address },
            from: { name: r.transfer.from.name, phone: normalizePhone(r.transfer.from.phone), cnic: r.transfer.from.cnic, relation: r.transfer.from.guardian?.relation, guardian: r.transfer.from.guardian?.name },
            toContactId: contact?.id ?? null,
            completedAt: closedAt,
            letterNo: q.number,
            ...(r.transfer.biometricMinutesAgo ? { biometricAt: t(r.transfer.biometricMinutesAgo) } : {}),
          }
        } else if (toRaw) data = { to: { name: toRaw.name, phone: normalizePhone(toRaw.phone), cnic: toRaw.cnic, relation: toRaw.guardian?.relation, guardian: toRaw.guardian?.name } }
      } else if (r.type === "ndc")
        data = { purpose: r.ndc?.purpose ?? "record", ...(r.status === "completed" ? { number: q.number, issuedAt: t(r.ndc?.issuedMinutesAgo ?? r.closedMinutesAgo), validDays: r.ndc?.validDays ?? 30 } : {}) }
      else if (r.type === "possession") {
        const p = r.possession ?? {}
        data = {
          ...(p.demarcatedMinutesAgo ? { demarcatedAt: t(p.demarcatedMinutesAgo) } : {}),
          ...(r.status === "completed" ? { letterNo: q.number, letterAt: t(p.letterMinutesAgo ?? r.closedMinutesAgo), handedOverAt: t(p.handedOverMinutesAgo ?? r.closedMinutesAgo) } : {}),
        }
        if (r.status === "completed" && b) possessionDone.push({ b, at: data.handedOverAt, number: q.number })
      } else if (r.type === "document") data = { kind: r.document?.kind ?? "statement" }
      else if (r.type === "record-update") data = { field: r.update?.field ?? "address" }
      else if (r.type === "complaint") data = { category: r.complaint?.category ?? "other" }

      const feeAt = r.fee?.paidMinutesAgo != null ? t(r.fee.paidMinutesAgo) : null
      const method = r.channel === "walk-in" ? "cash" : "bank-transfer"
      const fee = r.fee
        ? { amount: r.fee.amount, ...(feeAt ? { paidAt: feeAt, method, ref: r.fee.ref, accountId: method === "cash" ? accounts["1110"] : accounts["1130"], by: uid(r.assignedTo) ?? accountant.id } : {}) }
        : null
      const code = await nextCode(trx, "service-request")
      const [id] = await trx("serviceRequests").insert({
        code,
        type: r.type,
        status: r.status,
        priority: r.priority ?? "normal",
        channel: r.channel,
        bookingId: b?.id ?? null,
        unitId: r.unitId ? units.get(r.unitId) : null,
        contactId: contact?.id ?? null,
        subject: clean(r.subject),
        // "Open-file sale" only reads right for files
        details: (unitById.get(r.unitId)?.type === "file" ? clean(r.details) : clean(r.details)?.replace("Open-file sale", "Sold before possession")) || null,
        assignedTo: uid(r.assignedTo),
        steps: json(r.steps ?? []),
        fee: json(fee),
        data: json(data),
        resolution: clean(r.resolution ?? null) || (r.status === "completed" && r.type === "complaint" ? "Fixed and confirmed with the resident." : null),
        dueAt: r.type === "complaint" ? dueFrom(DEFAULT_SETTINGS, r.type, r.priority ?? "normal", created) : officeTime(dueFrom(DEFAULT_SETTINGS, r.type, r.priority ?? "normal", created), code),
        closedAt: ["completed", "rejected"].includes(r.status) ? (closedAt ?? created) : null,
        createdBy: uid(r.assignedTo) ?? owner.id,
        createdAt: created,
        updatedAt: closedAt ?? created,
      })
      const events = (r.events ?? []).map((e) => ({ requestId: id, kind: e.kind, text: clean(e.text), by: uid(e.by), at: later(t(e.minutesAgo), created) }))
      if (r.channel)
        events.unshift({
          requestId: id,
          kind: "system",
          text: `Logged (${r.channel === "walk-in" ? "Walk-in" : r.channel === "whatsapp" ? "WhatsApp" : r.channel[0].toUpperCase() + r.channel.slice(1)})`,
          by: uid(r.assignedTo) ?? owner.id,
          at: created,
        })
      if (feeAt) events.push({ requestId: id, kind: "system", text: `Fee received: ${rs(r.fee.amount)}${r.fee.ref ? ` (${r.fee.ref})` : ""}`, by: uid(r.assignedTo) ?? accountant.id, at: feeAt })
      if (q.number && r.type === "ndc") events.push({ requestId: id, kind: "system", text: `NDC ${q.number} issued, valid for ${data.validDays} days`, by: uid(r.assignedTo), at: data.issuedAt })
      if (q.number && r.type === "transfer") events.push({ requestId: id, kind: "system", text: `Transfer completed: the file is now in ${data.to.name}'s name (${q.number})`, by: uid("USR-0002"), at: closedAt })
      if (q.number && r.type === "possession") events.push({ requestId: id, kind: "system", text: `Possession handed over (${q.number})`, by: uid(r.assignedTo), at: data.handedOverAt })
      events.sort((x, y) => x.at - y.at)
      if (events.length) await trx("serviceRequestEvents").insert(events)
      if (feeAt) feeRequests.push({ id, at: feeAt })
      bump("service request events", events.length)
    }
  })
  bump("service requests", requests.length)
  // Possession given: the file is complete
  for (const p of possessionDone)
    await db("bookings")
      .where({ id: p.b.id })
      .update({ stage: "completed", completedAt: p.at, handoverAt: earlier(p.b.handoverAt ?? p.at, p.at) })

  // ----- cancellations and refunds -----
  const canceled = plan.filter((b) => b.cancel)
  for (const b of canceled) {
    const paid = b.receipts.filter((r) => r.status === "cleared").reduce((s, r) => s + r.amount, 0)
    b.refund = Math.round(paid * 0.9)
    await db("bookings").where({ id: b.id }).update({ status: "cancelled", stage: "active", cancelledAt: b.cancel.at, cancelledBy: owner.id, cancelReason: b.cancel.reason, deductionPct: 10, refundAmount: b.refund })
    await db("receipts").where({ bookingId: b.id }).whereIn("status", ["clearing", "pending"]).update({ status: "cancelled" })
    await db("units")
      .where({ id: units.get(b.vb.unitId) })
      .update({ status: "available" })
  }

  // ----- booking statuses from the money (the app's own ledger) -----
  await db.transaction(async (trx) => {
    for (const b of plan) await refreshBooking(trx, b.id)
  })

  // ----- commission payouts: on the 10th of each month for what became payable -----
  const payable = plan.filter((b) => b.downPaidAt && b.vb.status !== "token")
  const payouts = []
  for (let m = 12; m >= 1; m--) {
    const run = new Date(TODAY)
    run.setDate(10)
    run.setMonth(run.getMonth() - m + (TODAY.getDate() >= 10 ? 1 : 0))
    const runAt = new Date(`${pkDay(run)}T14:00:00+05:00`)
    if (runAt > NOW) continue
    const groups = new Map()
    for (const b of payable) {
      if (b.paidOut || b.downPaidAt > addDays(runAt, -12)) continue
      if (b.cancel && b.cancel.at < runAt) continue
      const key = b.vb.dealerId ? `d:${b.vb.dealerId}` : `a:${b.vb.agentId}`
      groups.set(key, [...(groups.get(key) ?? []), b])
      b.paidOut = runAt
    }
    for (const [key, list] of groups) payouts.push({ key, list, at: runAt })
  }
  await db.transaction(async (trx) => {
    for (const p of payouts.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))) {
      const dealer = p.key.startsWith("d:") ? dealers.get(p.key.slice(2)) : null
      const items = p.list.map((b) => ({ bookingId: b.id, pct: b.vb.commissionPct, amount: Math.round((b.sched.net * b.vb.commissionPct) / 100) }))
      const gross = items.reduce((s, i) => s + i.amount, 0)
      const whtPct = dealer ? 12 : 0
      const wht = Math.round((gross * whtPct) / 100)
      const code = await nextCode(trx, "commission-payout", {}, p.at)
      const [id] = await trx("commissionPayouts").insert({
        code,
        partnerType: dealer ? "dealer" : "agent",
        dealerId: dealer?.id ?? null,
        userId: dealer ? null : uid(p.key.slice(2)),
        paidOn: pkDay(p.at),
        method: "bank-transfer",
        accountId: dealer ? accounts["1140"] : accounts["1150"],
        reference: `IBFT ${int(seeded(code), 10000000, 99999999)}`,
        gross,
        whtPct,
        wht,
        net: gross - wht,
        notes: `Commission for ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(addDays(p.at, -15))}`,
        createdBy: accountant.id,
        createdAt: p.at,
      })
      await trx("commissionPayoutItems").insert(items.map((i) => ({ ...i, payoutId: id })))
      p.id = id
      p.code = code
    }
  })
  bump("commission payouts", payouts.length)

  // ----- vendors -----
  const vendors = new Map()
  await db.transaction(async (trx) => {
    for (const v of mine("finance/vendors.json")) {
      const code = await nextCode(trx, "vendor")
      const name = VENDOR_NAMES[v.id] ?? clean(v.name)
      const rand = seeded(v.id)
      const [id] = await trx("vendors").insert({
        code,
        name,
        category: v.category,
        accountId: accounts[v.account] ?? null,
        whtPct: v.whtPct ?? 0,
        ntn: v.ntn ?? null,
        phone: v.phone ? v.phone.replace(/\s+/g, " ") : null,
        email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example.com`,
        address: "Lahore",
        bankName: v.category === "utility" || v.category === "government" ? null : pick(rand, ["HBL", "MCB Bank", "UBL", "Meezan Bank", "Bank Alfalah"]),
        accountTitle: v.category === "utility" || v.category === "government" ? null : name,
        accountNumber: v.category === "utility" || v.category === "government" ? null : `XXXX-XXXX-${int(rand, 1000, 9999)}`,
        isActive: true,
        createdBy: accountant.id,
        createdAt: daysAgo(370),
      })
      vendors.set(v.id, { id, name })
    }
  })
  bump("vendors", vendors.size)

  // ----- approvals waiting in My Desk -----
  const approvalsMade = []
  const clearingCheque = plan.flatMap((b) => b.receipts.filter((r) => r.status === "clearing" && r.method === "cheque").map((r) => ({ b, r })))[0]
  const cancelAsk = plan.find((b) => !b.cancel && b.vb.behaviour === "defaulter" && !usedByRequests.has(b.vb.id) && b !== onHold && b.vb.status !== "token")

  // ----- the books: every event posted in date order (voucher numbers follow the financial year) -----
  const events = []
  const add = (at, order, label, fn) => events.push({ at: new Date(at), order, label, fn })
  const vouchersVite = mine("finance/vouchers.json")
  for (const v of vouchersVite) {
    const rand = seeded(v.id)
    const at = daysAgo(v.daysAgo, int(rand, 10, 17), int(rand, 0, 59))
    add(at, 0, "manual", (trx) =>
      posting.postVoucher(
        trx,
        { user: { id: uid(v.by) ?? accountant.id } },
        {
          type: v.type.toLowerCase(),
          date: at,
          narration: clean(v.narration),
          lines: v.lines.map((l) => ({ account: l.account, debit: l.debit ?? 0, credit: l.credit ?? 0, memo: clean(l.memo ?? null) })),
          projectId: v.projectId ? projects.get(v.projectId).id : null,
          vendorId: v.vendorId ? vendors.get(v.vendorId)?.id : null,
          party: v.vendorId ? vendors.get(v.vendorId)?.name : null,
          reference: v.ref,
          chequeNo: /^chq/i.test(v.ref ?? "") ? v.ref.replace(/^chq\s*/i, "") : null,
          approvedBy: owner.id,
        },
      ),
    )
  }
  // Salaries: paid from the payroll account on the 1st, less income tax and EOBI
  for (let m = 11; m >= 0; m--) {
    const d = new Date(TODAY)
    d.setDate(1)
    d.setMonth(d.getMonth() - m)
    const at = new Date(`${pkDay(d)}T15:00:00+05:00`)
    if (at > NOW) continue
    const gross = 4_150_000 + (11 - m) * 25_000
    const tax = Math.round(gross * 0.06)
    const eobi = 14 * 1_850
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(addDays(at, -5))
    add(at, 0, "manual", (trx) =>
      posting.postVoucher(
        trx,
        { user: { id: accountant.id } },
        {
          type: "bpv",
          date: at,
          narration: `Salaries for ${month}`,
          lines: [
            { account: "6300", debit: gross, memo: "14 staff" },
            { account: "1150", credit: gross - tax - eobi },
            { account: "2300", credit: tax, memo: "Income tax on salaries" },
            { account: "2700", credit: eobi, memo: "EOBI contributions" },
          ],
          party: "Staff payroll",
          reference: "Payroll IBFT",
          approvedBy: owner.id,
        },
      ),
    )
  }
  for (const b of plan) add(b.bookedAt, 1, "sale", (trx) => posting.postBookingSale(trx, ctx, b.id))
  for (const b of plan)
    for (const r of b.receipts) {
      const waits = ["cheque", "pay-order"].includes(r.method)
      add(r.at, 2, "received", (trx) => posting.postReceipt(trx, ctx, r.id, { clearing: waits }))
      if (waits && r.status === "cleared") add(r.clearedAt, 3, "cleared", (trx) => posting.postReceiptStatus(trx, ctx, r.id, "cleared"))
      if (r.status === "bounced") add(r.bouncedAt, 3, "bounced", (trx) => posting.postReceiptStatus(trx, ctx, r.id, "bounced"))
    }
  for (const b of canceled) {
    add(b.cancel.at, 4, "cancelled", (trx) => posting.postCancellation(trx, ctx, b.id))
    if (b.cancel.refundAfter != null && b.refund > 0) {
      const at = capNow(addDays(b.cancel.at, b.cancel.refundAfter))
      add(at, 5, "refund", async (trx) => {
        const out = await posting.postRefund(
          trx,
          { user: { id: accountant.id } },
          { bookingId: b.id, accountId: accounts["1140"], amount: b.refund, date: at, reference: `Chq ${int(seeded(b.code), 100000, 999999)}`, chequeNo: String(int(seeded(b.code), 100000, 999999)) },
        )
        await trx("bookings").where({ id: b.id }).update({ status: "refunded", updatedAt: at })
        b.refundCode = out.code
        b.refundAt = at
        return out
      })
    }
  }
  for (const p of payouts) add(p.at, 6, "commission", (trx) => posting.postCommissionPayout(trx, { user: { id: accountant.id } }, p.id))
  for (const f of feeRequests) add(f.at, 7, "fee", (trx) => posting.postServiceFee(trx, ctx, f.id))
  events.sort((a, b) => a.at - b.at || a.order - b.order)
  const posted = {}
  // Money accounts never go below zero: when a payment would overdraw one, money is moved in from
  // Meezan collections (or, for Meezan itself, capital from the directors) at that moment
  const moneyIds = new Map(["1110", "1120", "1130", "1140", "1150"].map((c) => [accounts[c], c]))
  const balance = new Map()
  const fund = async (trx, accountId, at) => {
    const code = moneyIds.get(accountId)
    const short = -balance.get(accountId)
    const cash = code === "1110" || code === "1120"
    const amount = Math.ceil((short + (cash ? 300_000 : 5_000_000)) / 100_000) * 100_000
    const from = code === "1130" ? "3100" : "1130"
    const out = await posting.postVoucher(
      trx,
      { user: { id: code === "1130" ? owner.id : accountant.id } },
      {
        type: "jv",
        date: at,
        narration: code === "1130" ? "Capital introduced by the directors" : cash ? "Cash withdrawn from Meezan collections for office use" : "Transfer from collections to cover payments",
        lines: [
          { account: code, debit: amount },
          { account: from, credit: amount },
        ],
        reference: code === "1130" ? "Directors' cheque" : "IBFT",
        approvedBy: owner.id,
      },
    )
    await track(trx, out, at)
    posted.transfer = (posted.transfer ?? 0) + 1
  }
  const track = async (trx, out, at) => {
    if (!out?.id) return
    const lines = await trx("voucherLines").where({ voucherId: out.id }).select("accountId", "debit", "credit")
    for (const l of lines) if (moneyIds.has(l.accountId)) balance.set(l.accountId, (balance.get(l.accountId) ?? 0) + Number(l.debit) - Number(l.credit))
    for (const [id] of moneyIds) if ((balance.get(id) ?? 0) < 0) await fund(trx, id, at)
    // Cash from the counter goes to the bank every few days
    const cash = balance.get(accounts["1110"]) ?? 0
    if (cash > 1_500_000 && at - lastDeposit >= 2 * DAY && out.code && !out.code.startsWith("JV")) {
      lastDeposit = at
      const amount = Math.floor((cash - 250_000) / 50_000) * 50_000
      const dep = await posting.postVoucher(
        trx,
        { user: { id: accountant.id } },
        {
          type: "jv",
          date: new Date(at.getTime() + 30 * 60_000),
          narration: "Cash collections deposited into Meezan Bank",
          lines: [
            { account: "1130", debit: amount },
            { account: "1110", credit: amount },
          ],
          reference: `Deposit slip ${int(seeded(String(at.getTime())), 100000, 999999)}`,
          approvedBy: owner.id,
        },
      )
      posted.deposit = (posted.deposit ?? 0) + 1
      await track(trx, dep, at)
    }
  }
  let lastDeposit = 0
  // Batches of events per transaction keep this quick; order is kept inside each batch
  for (let i = 0; i < events.length; i += 200) {
    await db.transaction(async (trx) => {
      for (const e of events.slice(i, i + 200)) {
        const out = await e.fn(trx)
        if (out) posted[e.label] = (posted[e.label] ?? 0) + 1
        await track(trx, out, e.at)
      }
    })
  }
  console.log(
    `Posted to Finance: ${Object.entries(posted)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ")}`,
  )

  // A voucher waiting for approval (entered by the accountant) and approvals in My Desk
  await db.transaction(async (trx) => {
    const v = await posting.postVoucher(
      trx,
      { user: { id: accountant.id } },
      {
        type: "bpv",
        status: "pending",
        date: daysAgo(1, 15),
        narration: "Billboards on Raiwind Road and Ferozepur Road, October",
        lines: [
          { account: "6200", debit: 450000 },
          { account: "1140", credit: 405000 },
          { account: "2300", credit: 45000, memo: "Tax withheld 10%" },
        ],
        vendorId: vendors.get("VND-008")?.id ?? null,
        party: vendors.get("VND-008")?.name ?? null,
        reference: "Invoice OAL-2291",
      },
    )
    approvalsMade.push(
      await approval(trx, {
        type: "voucher",
        app: "finance",
        subjectType: "voucher",
        subjectId: v.id,
        title: `Post ${v.code}: Billboards on Raiwind Road and Ferozepur Road`,
        details: "Bank payment to Outdoor Ads Lahore, less 10% tax withheld",
        amount: 450000,
        link: `/finance/vouchers?open=${v.code.toLowerCase()}`,
        requestedBy: accountant.id,
        createdAt: daysAgo(1, 15, 20),
      }),
    )
    if (cancelAsk) {
      const paid = cancelAsk.receipts.filter((r) => r.status === "cleared").reduce((s, r) => s + r.amount, 0)
      const refund = Math.round(paid * 0.9)
      approvalsMade.push(
        await approval(trx, {
          type: "cancellation",
          app: "operations",
          subjectType: "booking",
          subjectId: cancelAsk.id,
          title: `Cancel ${cancelAsk.code} (${contacts.get(cancelAsk.vb.contactId).name})`,
          details: `Refund ${rs(refund)} after 10% deduction`,
          amount: refund,
          link: `/operations/bookings/${cancelAsk.code.toLowerCase()}`,
          reason: "Buyer has missed several installments and asked to cancel the booking",
          payload: { reason: "Buyer has missed several installments and asked to cancel the booking", deductionPct: 10 },
          requestedBy: uid(cancelAsk.vb.agentId) ?? owner.id,
          createdAt: daysAgo(0, 10, 15),
        }),
      )
    }
    if (clearingCheque) {
      approvalsMade.push(
        await approval(trx, {
          type: "cheque",
          app: "finance",
          subjectType: "receipt",
          subjectId: clearingCheque.r.id,
          title: `Clear cheque ${clearingCheque.r.chequeNo} (${clearingCheque.r.code})`,
          details: `${clearingCheque.r.chequeBank} cheque on ${clearingCheque.b.code}`,
          amount: clearingCheque.r.amount,
          link: "/finance/cheques",
          reason: "The bank shows it credited this morning",
          payload: { status: "cleared" },
          requestedBy: uid(clearingCheque.b.vb.agentId) ?? owner.id,
          createdAt: daysAgo(0, 11, 5),
        }),
      )
    }
  })
  bump("approvals", approvalsMade.length)

  // ----- booking timelines -----
  const timeline = []
  const tl = (b, at, event, notes, by, type = "system") => timeline.push({ bookingId: b.id, type, event, notes, by, at: new Date(at), createdBy: by, createdAt: new Date(at) })
  for (const b of plan) {
    const agent = uid(b.vb.agentId) ?? owner.id
    const unitNo = b.unit.number
    tl(b, b.bookedAt, "created", `Booked ${unitNo} at ${rs(b.sched.net)} on ${b.plan.name}`, agent)
    tl(b, new Date(b.bookedAt.getTime() + 60_000), "kyc", "Buyer details and CNIC recorded", agent)
    for (const r of b.receipts) {
      tl(b, r.at, "receipt", `Received ${rs(r.amount)} (${r.code})${["cheque", "pay-order"].includes(r.method) ? ", in clearing" : ""}${r.notes ? ` for ${r.notes}` : ""}`, agent)
      if (r.status === "cleared" && ["cheque", "pay-order"].includes(r.method)) tl(b, r.clearedAt, "cleared", `${r.code} cleared: ${rs(r.amount)} counts now`, accountant.id)
      if (r.status === "bounced") tl(b, r.bouncedAt, "bounced", `${r.code} bounced: ${rs(r.amount)} is due again`, accountant.id)
    }
    if (b.allotmentNo) tl(b, b.allottedAt, "allotted", `Allotment letter issued (${b.allotmentNo})`, owner.id)
    if (b.handoverAt) tl(b, b.handoverAt, "handover", "Paid in full: ready for handover", owner.id)
    const done = possessionDone.find((p) => p.b === b)
    if (done) tl(b, done.at, "completed", `Possession given by Estate Management (${done.number})`, uid("USR-0019"))
    if (b.cancel) tl(b, b.cancel.at, "cancelled", `Canceled: ${b.cancel.reason}\nRefund due ${rs(b.refund)} after 10% deduction`, owner.id)
    if (b.refundCode) tl(b, b.refundAt, "approval", `Refund of ${rs(b.refund)} paid (${b.refundCode}): fully refunded`, accountant.id)
    if (b.paidOut) tl(b, b.paidOut, "commission", `Commission ${rs(Math.round((b.sched.net * b.vb.commissionPct) / 100))} paid`, accountant.id)
    if (b === onHold) tl(b, daysAgo(12, 13), "hold", "Put on hold: buyer abroad, signed documents awaited", owner.id)
    // Notes and calls the agent logged
    const rand = seeded(`notes-${b.vb.id}`)
    if (rand() < 0.45)
      tl(
        b,
        later(addDays(b.bookedAt, int(rand, 3, 40)), b.bookedAt),
        null,
        pick(rand, ["Called to remind about the next installment", "Buyer asked for the payment schedule on WhatsApp", "Shared the site progress photos", "Buyer visited the sales office with family"]),
        agent,
        pick(rand, ["call", "whatsapp", "note", "meeting"]),
      )
  }
  for (const t of timeline) if (t.at > REF) t.at = capNow(t.at)
  for (let i = 0; i < timeline.length; i += 500) await db("bookingActivities").insert(timeline.slice(i, i + 500))
  bump("booking activities", timeline.length)

  // ----- project progress, updates and events -----
  await seedProgress(db, projects, phases, owner)

  // ----- notifications (the bell) -----
  const recent = allReceipts.filter((r) => NOW - r.at < 3 * DAY).slice(-12)
  const notes = recent.map((r) => ({
    userId: owner.id,
    app: "operations",
    kind: "booking.receipt",
    title: `Payment received · ${r.b.code}`,
    body: `Received ${rs(r.amount)} (${r.b.receipts.find((x) => x.at === r.at && x.amount === r.amount)?.code ?? ""})`,
    href: `/operations/bookings/${r.b.code.toLowerCase()}`,
    icon: "money-dollar-circle-line",
    createdBy: uid(r.b.vb.agentId),
    createdAt: r.at,
    readAt: NOW - r.at > DAY ? r.at : null,
  }))
  for (const a of approvalsMade)
    notes.push({
      userId: owner.id,
      app: "desk",
      kind: "approval.requested",
      title: `Approval needed · ${a.code}`,
      body: a.title,
      href: "/desk/approvals",
      icon: "shield-check-line",
      createdBy: a.requestedBy,
      createdAt: a.createdAt,
      readAt: null,
    })
  if (notes.length) await db("notifications").insert(notes)
  bump("notifications", notes.length)

  // ----- activity log -----
  const log = [
    [400, "settings", "settings.profile", owner.id, "updated the company profile"],
    [366, "finance", "account.created", accountant.id, "added the bank accounts Meezan Bank · Collections, HBL · Current and Bank Alfalah · Payroll"],
    [360, "team", "team.created", owner.id, "created the teams Enclave Sales Team and Heights & Commercial"],
    [9, "portfolio", "price-list.created", owner.id, "drafted Skyline Enclave price list 2027"],
    [0, "sign-in", "user.signed_in", owner.id, "signed in"],
  ].map(([d, type, action, actorUserId, summary]) => ({ type, action, actorUserId, summary, createdAt: daysAgo(d, 9, 30) }))
  await db("activityLog").insert(log)

  for (const [k, n] of Object.entries(counts)) if (!n) delete counts[k]
}

// A row in the approvals inbox → { code, title, requestedBy, createdAt }
async function approval(trx, a) {
  const code = await nextCode(trx, "approval")
  await trx("approvals").insert({ ...a, code, status: "pending", payload: a.payload ? JSON.stringify(a.payload) : null, createdBy: a.requestedBy })
  return { code, title: a.title, requestedBy: a.requestedBy, createdAt: a.createdAt }
}

// Starting prices from a project's available units, one row per size and type (as the app does)
async function priceRows(db, projectId, types) {
  const units = await db("units").where({ projectId, status: "available" }).whereNull("deletedAt").select("type", "sizeValue", "sizeUnit", "price")
  const groups = new Map()
  for (const u of units) {
    const size = `${Number(u.sizeValue)} ${u.sizeUnit === "sqft" ? "sq ft" : u.sizeUnit[0].toUpperCase() + u.sizeUnit.slice(1)}`
    const key = `${size}|${u.type}`
    const g = groups.get(key) ?? { size, type: types[u.type] ?? u.type, min: Infinity, count: 0 }
    g.min = Math.min(g.min, Number(u.price))
    g.count += 1
    groups.set(key, g)
  }
  const lac = (n) => (n >= 10_000_000 ? `Rs ${+(n / 10_000_000).toFixed(2)} Crore` : `Rs ${+(n / 100_000).toFixed(1)} Lac`)
  return [...groups.values()]
    .sort((a, b) => a.min - b.min)
    .slice(0, 6)
    .map((g) => ({ label: `${g.size} ${g.type}`.trim(), price: `From ${lac(g.min)}`, detail: `${g.count} available` }))
}

async function seedProgress(db, projects, phases, owner) {
  const byCode = Object.fromEntries([...projects.values()].map((p) => [p.code, p.id]))
  const phaseOf = (projectCode, i) => [...phases.values()].filter((p) => p.projectId === byCode[projectCode])[i]?.id ?? null
  const progress = [
    ["SKE", null, "roads", 85],
    ["SKE", null, "electricity", 80],
    ["SKE", null, "sewerage", 90],
    ["SKE", null, "water", 75],
    ["SKE", null, "gas", 40],
    ["SKE", null, "boundary-wall", 100],
    ["SKE", null, "parks", 60],
    ["SKE", 1, "roads", 55],
    ["SKE", 1, "electricity", 35],
    ["SKE", 1, "sewerage", 45],
    ["SKH", null, "structure", 72],
    ["SKH", null, "finishing", 18],
    ["SKH", null, "electricity", 30],
    ["SBS", null, "structure", 6],
    ["SBS", null, "boundary-wall", 100],
  ]
  await db("projectProgress").insert(progress.map(([p, ph, work, percent]) => ({ projectId: byCode[p], phaseId: ph == null ? null : phaseOf(p, ph), work, percent, createdBy: owner.id, createdAt: daysAgo(30) })))
  const updates = [
    ["SKE", "construction", "Carpeting of Block D main roads started", "Road carpeting has started on the Block D main boulevard. Streets 1 to 6 will be complete by December.", 21, [{ work: "roads", from: 48, to: 55 }]],
    ["SKE", "possession", "Possession open in Block C", "Plot owners in Block C can now apply for possession at the site office. Demarcation is done within a week.", 64, null],
    [
      "SKH",
      "construction",
      "Tower A reaches the 10th floor",
      "The structure of Skyline Heights Tower A has reached the 10th floor slab. Brickwork is under way on floors 1 to 5.",
      12,
      [{ work: "structure", from: 65, to: 72 }],
    ],
    ["SBS", "approval", "Building plan submitted to DHA", "The building plan for Skyline Business Square has been submitted to DHA for approval.", 45, null],
    ["SKE", "announcement", "Phase 3 open files launched", "Phase 3 open files are available on a 3-year installment plan. Balloting will be held once 70% of the files are sold.", 120, null],
  ]
  await db("projectUpdates").insert(
    updates.map(([p, type, title, body, d, changes]) => ({
      code: randomCode(),
      projectId: byCode[p],
      type,
      title,
      body,
      changes: json(changes),
      postedAt: daysAgo(d, 12),
      createdBy: owner.id,
      createdAt: daysAgo(d, 12),
    })),
  )
  const events = [
    ["SBS", "launch", "Skyline Business Square launch", 29, "Pearl Continental Hotel, Lahore", "scheduled"],
    ["SKE", "possession", "Block C possession ceremony", -60, "Skyline Enclave site office", "held"],
    ["SKE", "expo", "Lahore Property Expo 2026", -52, "Expo Center, Johar Town, Lahore", "held"],
    ["SKH", "site-visit", "Weekend site visit: Tower A", 5, "Skyline Heights, Gulberg III", "scheduled"],
  ]
  await db("projectEvents").insert(
    events.map(([p, type, title, d, venue, status]) => ({
      code: randomCode(),
      projectId: byCode[p],
      type,
      title,
      startsAt: daysAgo(-d, 11),
      endsAt: daysAgo(-d, 17),
      venue,
      status,
      createdBy: owner.id,
      createdAt: daysAgo(Math.max(1, -d + 20), 10),
    })),
  )
}

// ---------- checks ----------

async function check() {
  const tenant = await findDemoTenant()
  if (!tenant) {
    console.log("No demo workspace yet. Run yarn demo:seed.")
    return
  }
  const db = tenantDb(tenant)
  const tables = [
    "projects",
    "projectPhases",
    "projectBlocks",
    "units",
    "priceLists",
    "contacts",
    "contactLinks",
    "dealers",
    "members",
    "teams",
    "leads",
    "leadActivities",
    "campaigns",
    "leadForms",
    "landingPages",
    "bookings",
    "bookingInstallments",
    "receipts",
    "bookingActivities",
    "commissionPayouts",
    "commissionPayoutItems",
    "serviceRequests",
    "serviceRequestEvents",
    "vendors",
    "vouchers",
    "voucherLines",
    "approvals",
    "notifications",
    "projectProgress",
    "projectUpdates",
    "projectEvents",
  ]
  console.log(`Rows in ${tenant.code} (${tenant.dbName}):`)
  const out = []
  for (const t of tables) out.push(`${t} ${(await db(t).count({ n: "*" }).first()).n}`)
  console.log(`  ${out.join(" · ")}`)
  const by = async (table, col) => (await db(table).groupBy(col).select(col).count({ n: "*" })).map((r) => `${r[col]} ${r.n}`).join(", ")
  console.log(`  bookings by status: ${await by("bookings", "status")}`)
  console.log(`  bookings by stage: ${await by("bookings", "stage")}`)
  console.log(`  receipts by status: ${await by("receipts", "status")}`)
  console.log(`  units by status: ${await by("units", "status")}`)
  console.log(`  leads by status: ${await by("leads", "status")}`)
  console.log(`  requests by status: ${await by("serviceRequests", "status")}`)
  console.log(`  vouchers by source: ${await by("vouchers", "source")}`)

  const tb = await db("voucherLines as l").join("vouchers as v", "v.id", "l.voucherId").whereIn("v.status", ["posted", "void"]).whereNull("v.deletedAt").sum({ d: "l.debit", c: "l.credit" }).first()
  const d = Math.round(Number(tb.d) * 100) / 100
  const c = Math.round(Number(tb.c) * 100) / 100
  console.log(`  trial balance: debits ${rs(d)} · credits ${rs(c)} → ${d === c ? "balanced ✓" : "NOT BALANCED ✗"}`)
  if (d !== c) process.exitCode = 1
  const banks = await db("accounts as a")
    .leftJoin("voucherLines as l", "l.accountId", "a.id")
    .leftJoin("vouchers as v", function () {
      this.on("v.id", "=", "l.voucherId").andOnIn("v.status", ["posted", "void"])
    })
    .whereIn("a.kind", ["cash", "bank"])
    .groupBy("a.id", "a.name")
    .select("a.name")
    .sum({ d: db.raw("case when v.id is not null then l.debit else 0 end"), c: db.raw("case when v.id is not null then l.credit else 0 end") })
  console.log(`  cash & bank: ${banks.map((b) => `${b.name} ${rs(Number(b.d) - Number(b.c))}`).join(" · ")}`)

  // The app's own queries, as an owner sees them
  const owner = await authDb()("users").where({ email: OWNER_EMAIL }).first("id", "name", "email")
  const grants = { "operations.commissions": "all", "operations.discount": 100, "contacts.cnic": true }
  const ctx = {
    db,
    user: owner,
    tenant,
    permissions: ["*"],
    scope: "all",
    myTeams: [],
    grant: (k) => grants[k] ?? true,
    has: () => true,
    can: () => true,
  }
  const tries = [
    ["operations listBookings", async () => (await import("../src/modules/operations/server/queries.js")).listBookings(ctx)],
    ["operations salesOverview", async () => (await import("../src/modules/operations/server/queries.js")).salesOverview(ctx)],
    ["operations listDueLines", async () => (await import("../src/modules/operations/server/queries.js")).listDueLines(ctx)],
    ["operations commissionRows", async () => (await (await import("../src/modules/operations/server/commissions.js")).commissionRows(ctx)).rows],
    ["operations listPayouts", async () => (await import("../src/modules/operations/server/commissions.js")).listPayouts(ctx)],
    ["crm listLeads", async () => (await import("../src/modules/crm/server/queries.js")).listLeads(ctx)],
    ["estate listRequests", async () => (await import("../src/modules/estate/server/queries.js")).listRequests(ctx)],
    ["estate possessionReady", async () => (await import("../src/modules/estate/server/queries.js")).possessionReady(ctx)],
    ["campaigns listCampaigns", async () => (await import("../src/modules/campaigns/server/queries.js")).listCampaigns(ctx)],
    ["finance listVouchers", async () => (await import("../src/modules/finance/server/queries.js")).listVouchers(ctx)],
    ["finance chequeRegister", async () => (await import("../src/modules/finance/server/money-queries.js")).chequeRegister(ctx)],
    ["finance receivableBookings", async () => (await import("../src/modules/finance/server/money-queries.js")).receivableBookings(ctx)],
    ["finance refundRegister", async () => (await import("../src/modules/finance/server/money-queries.js")).refundRegister(ctx)],
    ["finance vendorRegister", async () => (await import("../src/modules/finance/server/money-queries.js")).vendorRegister(ctx)],
  ]
  const sample = async (table, where = {}) => (await db(table).where(where).whereNull("deletedAt").orderBy("id", "desc").first("code"))?.code
  const ops = () => import("../src/modules/operations/server/queries.js")
  for (const status of ["cancelled", "refunded", "defaulter", "overdue", "current"]) {
    const code = await sample("bookings", { status })
    if (code) tries.push([`operations getBooking ${code} (${status})`, async () => (await ops()).getBooking(ctx, code)])
  }
  for (const status of ["booked", "lost", "negotiation"]) {
    const code = await sample("leads", { status })
    if (code) tries.push([`crm getLead ${code} (${status})`, async () => (await import("../src/modules/crm/server/queries.js")).getLead(ctx, code)])
  }
  for (const type of ["transfer", "ndc", "possession", "complaint", "document", "record-update"]) {
    const code = await sample("serviceRequests", { type })
    if (code) tries.push([`estate getRequest ${code} (${type})`, async () => (await import("../src/modules/estate/server/queries.js")).getRequest(ctx, code)])
  }
  const campaign = await sample("campaigns", { status: "active" })
  tries.push([`campaigns getCampaign ${campaign}`, async () => (await import("../src/modules/campaigns/server/queries.js")).getCampaign(ctx, campaign)])
  tries.push(["crm crmOverview", async () => (await import("../src/modules/crm/server/overview.js")).crmOverview(ctx)])
  // Every report in Finance, CRM, Campaigns and Project Portfolio, and the Operations reports
  for (const app of ["finance", "crm", "campaigns", "portfolio"]) {
    const m = await import(`../src/modules/${app}/server/reports.js`)
    let filters
    for (const r of m.REPORTS)
      tries.push([
        `${app} report ${r.id ?? r.key}`,
        async () => {
          filters ??= await m.reportFilters(ctx)
          return m.runReport(ctx, r, {}, filters)
        },
      ])
  }
  const sales = await import("../src/modules/operations/server/reports.js")
  for (const r of sales.REPORTS) tries.push([`operations report ${r.key ?? r.id}`, () => sales.salesReport(ctx, r.key ?? r.id, {})])
  let failed = 0
  for (const [name, fn] of tries) {
    try {
      const r = await fn()
      const n = Array.isArray(r) ? r.length : r && typeof r === "object" ? Object.keys(r).length : r
      console.log(`  ✓ ${name} (${Array.isArray(r) ? `${n} rows` : `${n} keys`})`)
    } catch (err) {
      // Reads that need a signed-in request (Next.js cookies) can't run from a script
      if (/outside a request scope/.test(err.message)) {
        console.log(`  - ${name}: needs a signed-in request, skipped`)
        continue
      }
      failed++
      console.log(`  ✗ ${name}: ${String(err.message).split("\n")[0].slice(0, 200)}`)
    }
  }
  console.log(failed ? `  ${failed} of ${tries.length} app queries failed` : `  all ${tries.length} app queries ran`)
}
