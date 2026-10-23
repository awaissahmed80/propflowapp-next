import "server-only"
import crypto from "node:crypto"
import { platformDb } from "@/server/db/connections"
import { DEFAULT_ROLES } from "@/modules/users/permissions"
import { purgeWorkspace } from "@/modules/console/server/deletion"
import { DEMO, STEPS, buildDemo, demoLogins, findDemoTenant } from "./seed"

// The console's one-click demo workspace (Console › Workspaces › Demo workspace): install, reset
// (wipe and build again with a new password) and remove. There is only ever one: "Skyline
// Developers". Its state lives in the platform setting "demo_workspace":
//   { tenantId, code, password, installedAt, installedBy, status: installing | removing | ready |
//     failed, step, percent, startedAt, error, seconds }
// The password is kept in plain text on purpose: it's a throwaway demo login shared with
// prospective customers, shown on the console card and sent in the demo details email. It is
// never a real person's password.
//
// Building takes a minute or two, so the console starts the job and answers (the work runs in
// Next's after()); the card polls the state.

export const DEMO_SETTING = "demo_workspace"
// A job that hasn't moved for this long is taken as dead (the server restarted mid-way)
const STALE_MS = 15 * 60_000
const TOTAL = STEPS.reduce((n, [, w]) => n + w, 0)

// What to try with each role, for the card and the demo details email
export const DEMO_TRY = {
  owner: ["Dashboards", "Approvals on My Desk", "Users & roles", "Settings"],
  admin: ["Every app", "Recycle bin", "Import & export"],
  "sales-manager": ["Lead board", "Discount approvals", "Sales reports"],
  "team-lead": ["Team's leads", "Assign leads", "Leaderboard"],
  "sales-agent": ["My leads and follow-ups", "Book a unit"],
  "finance-manager": ["Cheques", "Vouchers", "Trial balance", "Payroll"],
  dealer: ["Dealer quota", "Own leads", "Commissions"],
  "estate-officer": ["Transfers", "NDC", "Possession"],
  "project-manager": ["Projects", "Inventory", "Price lists"],
}

const parse = (v) => {
  if (v == null) return null
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

export async function readDemoState() {
  const row = await platformDb()("settings").where({ key: DEMO_SETTING }).first("value", "updatedAt")
  if (!row) return null
  const state = parse(row.value)
  const working = state?.status === "installing" || state?.status === "removing"
  if (working && Date.now() - new Date(row.updatedAt).getTime() > STALE_MS) return { ...state, status: "failed", error: state.error ?? "The job stopped part-way (the server may have restarted)." }
  return state
}

async function writeState(value, db = platformDb()) {
  await db("settings")
    .insert({ key: DEMO_SETTING, value: JSON.stringify(value), description: "The console's demo workspace (one-click demo)", updatedAt: new Date() })
    .onConflict("key")
    .merge(["value", "updatedAt"])
}
const patchState = async (patch) => writeState({ ...((await readDemoState()) ?? {}), ...patch })

// "Demo-K7QM-4TXP": easy to read out and type (no 0/O or 1/I/l)
export function demoPassword() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const part = () => Array.from(crypto.randomBytes(4), (b) => abc[b % abc.length]).join("")
  return `Demo-${part()}-${part()}`
}

// The sign-ins to show: one per role (the first person with it), in the roles' order
export function demoPeople() {
  const names = Object.fromEntries(DEFAULT_ROLES.map((r) => [r.code, r.name]))
  const order = DEFAULT_ROLES.map((r) => r.code)
  const seen = new Set()
  return demoLogins()
    .filter((p) => (seen.has(p.role) ? false : seen.add(p.role)))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((p) => ({ key: p.role, label: names[p.role] ?? p.role, name: p.name, email: p.email, try: DEMO_TRY[p.role] ?? [] }))
}

// For the console card: { state, tenant, people, company }
// A demo made outside the console (yarn demo:seed) shows as "external": Reset gives it a password
export async function demoWorkspaceStatus() {
  let state = await readDemoState()
  let tenant = state?.tenantId ? await platformDb()("tenants").where({ id: state.tenantId }).whereNull("deletedAt").first("id", "code", "slug", "name", "status", "dbName", "dbHost") : null
  if (!tenant && !["installing", "removing", "failed"].includes(state?.status)) {
    const found = await findDemoTenant().catch(() => null)
    if (found) {
      tenant = found
      state = { status: "external", tenantId: found.id, code: found.code }
    } else if (state?.status === "ready") state = { status: "none" }
  }
  return { state, tenant: tenant ?? null, people: demoPeople(), company: DEMO.company }
}

// Claim the demo workspace for a job (one at a time). mode: install | reset | remove.
// → { ok, run, previous } (run() does the work and never throws) or { error }
export async function startDemoJob(mode, { actorUserId }) {
  const platform = platformDb()
  const password = demoPassword()
  let previous = null
  const claimed = await platform.transaction(async (trx) => {
    await trx("settings")
      .insert({ key: DEMO_SETTING, value: JSON.stringify({ status: "none" }), description: "The console's demo workspace (one-click demo)", updatedAt: new Date() })
      .onConflict("key")
      .ignore()
    const row = await trx("settings").where({ key: DEMO_SETTING }).forUpdate().first("value", "updatedAt")
    const state = parse(row.value) ?? {}
    const working = state.status === "installing" || state.status === "removing"
    if (working && Date.now() - new Date(row.updatedAt).getTime() <= STALE_MS) return { error: "The demo workspace is busy with another job. Try again in a moment." }
    // The console's demo, or one made by yarn demo:seed
    const tenant = state.tenantId
      ? await trx("tenants").where({ id: state.tenantId }).whereNull("deletedAt").first("id")
      : await trx("tenants").where({ slug: DEMO.slug, email: DEMO.ownerEmail }).whereNull("deletedAt").first("id")
    if (mode === "install" && tenant && state.status === "ready") return { error: "The demo workspace is already installed." }
    if (mode === "remove" && !tenant) return { error: "The demo workspace isn't installed." }
    // Another (real) workspace uses the demo's short name
    const other = await trx("tenants").where({ slug: DEMO.slug }).whereNull("deletedAt").whereNot({ email: DEMO.ownerEmail }).first("code")
    if (other && mode !== "remove") return { error: `Workspace ${other.code} already uses the short name "${DEMO.slug}". Rename it first.` }
    previous = state
    if (mode === "remove") await writeState({ ...state, status: "removing", step: "remove", percent: 0, startedAt: new Date().toISOString() }, trx)
    else
      await writeState(
        { status: "installing", step: STEPS[0][0], percent: 0, startedAt: new Date().toISOString(), installedBy: actorUserId ?? null, tenantId: state.tenantId ?? null, code: state.code ?? null, mode },
        trx,
      )
    return { ok: true }
  })
  if (claimed.error) return claimed
  const run = mode === "remove" ? () => runRemove(previous, actorUserId) : () => runInstall({ actorUserId, password })
  return { ok: true, run, previous }
}

async function runInstall({ actorUserId, password }) {
  const started = Date.now()
  let done = 0
  try {
    const { tenant } = await buildDemo({
      password,
      logger: () => {},
      onStep: async (key) => {
        const before = STEPS.slice(
          0,
          STEPS.findIndex(([k]) => k === key),
        ).reduce((n, [, w]) => n + w, 0)
        done = Math.round((before / TOTAL) * 100)
        await patchState({ step: key, percent: done })
      },
    })
    await writeState({
      status: "ready",
      tenantId: tenant.id,
      code: tenant.code,
      password,
      installedAt: new Date().toISOString(),
      installedBy: actorUserId ?? null,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  } catch (err) {
    console.error("Demo workspace install failed:", err)
    const tenant = await findDemoTenant().catch(() => null)
    await patchState({ status: "failed", error: String(err?.message ?? err).slice(0, 300), percent: done, tenantId: tenant?.id ?? null, code: tenant?.code ?? null }).catch(() => {})
  }
}

async function runRemove(previous, actorUserId) {
  try {
    const tenant = previous?.tenantId ? await platformDb()("tenants").where({ id: previous.tenantId }).first() : await findDemoTenant()
    if (tenant) await purgeWorkspace(tenant, { staffUserId: actorUserId })
    await writeState({ status: "none" })
  } catch (err) {
    console.error("Demo workspace remove failed:", err)
    await patchState({ status: "failed", error: String(err?.message ?? err).slice(0, 300) }).catch(() => {})
  }
}
