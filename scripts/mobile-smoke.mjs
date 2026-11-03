// Smoke test for the mobile API (docs/mobile-api.md) against the local demo workspace (Skyline
// Developers, `yarn demo:seed`): signs in as the demo owner and sales agent, adds a test lead and
// works it with opIds (sent twice), checks scoping, approvals, notifications and sign-out. At the
// end the test lead, its opIds and the test's phone sessions are deleted again.
// Development only: it uses the demo sign-ins from /dev/demo-accounts and never prints them.
//   node scripts/mobile-smoke.mjs [https://auth.propflowapp.test/api/mobile/v1]
import crypto from "node:crypto"
import { register } from "node:module"
import nextEnv from "@next/env"

register("./lib/app-imports.mjs", import.meta.url)
nextEnv.loadEnvConfig(process.cwd(), true)
const { authDb, platformDb, tenantDb, closeAll } = await import("../src/server/db/connections.js")

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0" // the local .test certificate
const STARTED = new Date(Date.now() - 1000)
const BASE = process.argv[2] ?? "https://auth.propflowapp.test/api/mobile/v1"
const device = { name: "Smoke test", platform: "ios", appVersion: "1.0.0" }
let failures = 0
const check = (ok, label, extra = "") => {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? `  ${extra}` : ""}`)
}
async function call(method, path, { token, body, version = "1.0.0" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", "x-app-version": version, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}
async function signIn(email, password) {
  let r = await call("POST", "/auth/sign-in", { body: { email, password, device } })
  if (r.data?.next === "choose") r = await call("POST", "/auth/choose", { body: { ticket: r.data.ticket, workspaceKey: r.data.workspaces[0].key } })
  return r
}

const demo = (await call("GET", "/dev/demo-accounts")).data
if (!demo) throw new Error("No demo workspace: run yarn demo:seed")
const email = (role) => demo.people.find((p) => p.role === role).email

// Errors
check((await call("POST", "/auth/sign-in", { body: { email: email("Owner"), password: "wrong-password", device } })).status === 401, "wrong password → 401")
check((await call("GET", "/me")).status === 401, "no token → 401")
check((await call("POST", "/auth/sign-in", { body: {} })).data?.error?.code === "invalid", "empty body → invalid")

// Owner
const owner = await signIn(email("Owner"), demo.password)
check(Boolean(owner.data?.token), "owner signs in", owner.data?.error?.code ?? "")
const ot = owner.data.token
const me = await call("GET", "/me", { token: ot })
check(me.status === 200 && me.data.workspace?.apps?.crm, "GET /me", `apps: ${Object.keys(me.data?.workspace?.apps ?? {}).join(", ")}`)
check((await call("GET", "/workspaces", { token: ot })).data?.workspaces?.some((w) => w.current), "GET /workspaces")
const home = await call("GET", "/home", { token: ot })
check(home.status === 200 && home.data.counts, "GET /home", JSON.stringify(home.data?.counts ?? home.data))
check((await call("GET", "/tasks", { token: ot })).status === 200, "GET /tasks")
const lists = await call("GET", "/crm/lists", { token: ot })
check(lists.status === 200 && lists.data.lists?.["lead-status"]?.length, "GET /crm/lists", `${lists.data?.agents?.length} agents, ${lists.data?.projects?.length} projects`)
const leads = await call("GET", "/leads?size=10", { token: ot })
check(leads.status === 200 && leads.data.rows?.length === 10, "GET /leads", `total ${leads.data?.total}, counts ${JSON.stringify(leads.data?.counts)}`)
const due = await call("GET", "/leads?tab=due&sort=next", { token: ot })
check(due.status === 200, "GET /leads?tab=due", `total ${due.data?.total}`)
const first0 = leads.data.rows[0].code.toLowerCase()
const one = await call("GET", `/leads/${first0}`, { token: ot })
check(one.status === 200 && one.data.lead?.code === leads.data.rows[0].code, `GET /leads/${first0}`, `${one.data?.lead?.history?.length} history, ${one.data?.lead?.planned?.length} planned`)
check((await call("GET", "/leads/ld-0", { token: ot })).status === 404, "unknown lead → 404")

// A test lead (deleted at the end), added with an opId sent twice
const phone = `0300${String(crypto.randomInt(1e7)).padStart(7, "0")}`
const add = { lead: { name: "Mobile API smoke test", phone, source: "", notes: "Made by scripts/mobile-smoke.mjs" }, opId: crypto.randomUUID() }
const made = await call("POST", "/leads", { token: ot, body: add })
check(made.data?.ok && made.data.code, "POST /leads", made.data?.code ?? JSON.stringify(made.data))
const code = made.data.code
check((await call("POST", "/leads", { token: ot, body: add })).data?.code === code, "same opId → the same lead, not two")
check((await call("POST", "/leads", { token: ot, body: { lead: add.lead } })).data?.error?.code === "duplicate", "same mobile → 409 duplicate")
const patched = await call("PATCH", `/leads/${code}`, { token: ot, body: { lead: { city: "Lahore" } } })
check(patched.data?.ok, "PATCH /leads/<code>", JSON.stringify(patched.data))
check((await call("GET", `/leads/${code}`, { token: ot })).data?.lead?.city === "Lahore", "the change kept the other fields", "")

// A logged call, sent twice with the same opId
const opId = crypto.randomUUID()
const body = { kind: "log", type: "call", outcome: "", notes: "Smoke test call (mobile API)", opId }
const first = await call("POST", `/leads/${code}/activities`, { token: ot, body })
const again = await call("POST", `/leads/${code}/activities`, { token: ot, body })
check(first.data?.ok && !first.data.replayed, "log a call", JSON.stringify(first.data))
check(again.data?.ok && again.data.replayed, "same opId → replayed, not twice")
const after = await call("GET", `/leads/${code}`, { token: ot })
check(after.data.lead.history.filter((a) => a.notes === body.notes).length === 1, "one activity recorded")
check((await call("POST", `/leads/${code}/status`, { token: ot, body: { status: "contacted", opId } })).data?.error?.code === "op_conflict", "opId reused for another change → op_conflict")
const plan = await call("POST", `/leads/${code}/activities`, { token: ot, body: { kind: "plan", type: "call", next: "", at: "2030-01-01T11:00" } })
check(plan.data?.ok, "plan a follow-up", JSON.stringify(plan.data))
const planned = (await call("GET", `/leads/${code}`, { token: ot })).data.lead.planned[0]
const moved = await call("PATCH", `/leads/${code}/activities`, { token: ot, body: { id: planned.id, action: "cancel" } })
check(moved.data?.ok, "cancel the planned follow-up", JSON.stringify(moved.data))

// Contacts: the directory, one contact, and a test contact (deleted at the end) added, clashed and edited
const CONTACT_PHONE = "03990001234"
const ctLists = await call("GET", "/contacts/lists", { token: ot })
check(ctLists.status === 200 && ctLists.data.lists?.["contact-type"]?.length, "GET /contacts/lists", `${ctLists.data?.lists?.["contact-type"]?.length} types`)
const contacts = await call("GET", "/contacts?size=5", { token: ot })
check(contacts.status === 200 && contacts.data.rows?.length === 5, "GET /contacts", `total ${contacts.data?.total}, counts ${JSON.stringify(contacts.data?.counts?.types)}`)
const customers = await call("GET", "/contacts?view=type:customer&size=1", { token: ot })
check(customers.data?.rows?.every((c) => c.types.includes("customer")), "GET /contacts?view=type:customer", `${customers.data?.total}`)
const ct = customers.data.rows[0].code.toLowerCase()
const contact = await call("GET", `/contacts/${ct}`, { token: ot })
check(contact.status === 200 && contact.data.contact?.code === customers.data.rows[0].code, `GET /contacts/${ct}`, `${contact.data?.contact?.leads?.length} leads, ${contact.data?.contact?.bookings?.length} bookings, ${contact.data?.contact?.timeline?.length} timeline`)
check((await call("GET", "/contacts/ct-0", { token: ot })).status === 404, "unknown contact → 404")
const addContact = { contact: { name: "Mobile API smoke contact", phone: CONTACT_PHONE, types: ["vendor"] }, opId: crypto.randomUUID() }
const madeContact = await call("POST", "/contacts", { token: ot, body: addContact })
check(madeContact.data?.ok, "POST /contacts", madeContact.data?.code ?? JSON.stringify(madeContact.data))
check((await call("POST", "/contacts", { token: ot, body: addContact })).data?.replayed, "same opId → the same contact, not two")
const clash = await call("POST", "/contacts", { token: ot, body: { contact: { ...addContact.contact, name: "Someone else" } } })
check(clash.status === 409 && clash.data?.clash?.code === madeContact.data?.code, "same mobile → 409 duplicate with clash")
const ctCode = madeContact.data?.code?.toLowerCase()
check((await call("PATCH", `/contacts/${ctCode}`, { token: ot, body: { contact: { company: "Smoke Supplies" } } })).data?.ok, "PATCH /contacts/<code>")
const edited = (await call("GET", `/contacts/${ctCode}`, { token: ot })).data?.contact
check(edited?.company === "Smoke Supplies" && edited?.types.includes("vendor"), "the change kept the other fields")

// Inventory, approvals, notifications
const projects = await call("GET", "/projects", { token: ot })
check(projects.status === 200 && projects.data.projects?.length, "GET /projects", `${projects.data?.projects?.length} projects`)
const p = projects.data.projects[0].code.toLowerCase()
const units = await call("GET", `/projects/${p}/units?status=available&size=20`, { token: ot })
check(units.status === 200 && units.data.rows.every((u) => u.status === "available"), `GET /projects/${p}/units`, `${units.data?.total} available, counts ${JSON.stringify(units.data?.counts)}`)
const approvals = await call("GET", "/approvals", { token: ot })
check(approvals.status === 200, "GET /approvals", `${approvals.data?.waiting?.length} waiting`)
const notes = await call("GET", "/notifications?size=5", { token: ot })
check(notes.status === 200 && Array.isArray(notes.data.items), "GET /notifications", `${notes.data?.unread} unread`)
check((await call("GET", "/follow-ups?kind=follow-ups", { token: ot })).status === 200, "GET /follow-ups")
check((await call("GET", "/me/sessions", { token: ot })).data?.sessions?.some((s) => s.current && s.kind === "phone"), "GET /me/sessions")
check((await call("GET", "/me", { token: ot, version: "0.0.1" })).status === (process.env.MOBILE_MIN_VERSION ? 426 : 200), "version gate")

// Sales agent: only their own leads
const agent = await signIn(email("Sales Agent"), demo.password)
check(Boolean(agent.data?.token), "sales agent signs in")
const at = agent.data.token
const theirs = await call("GET", "/leads?size=100", { token: at })
const agentId = agent.data.user.id
const theirContacts = await call("GET", "/contacts?size=1", { token: at })
check(theirContacts.status === 200 && theirContacts.data.total < contacts.data.total, "agent sees only contacts linked to their work", `${theirContacts.data?.total} of ${contacts.data.total}`)
check(theirs.status === 200 && theirs.data.rows.every((l) => l.agent?.id === agentId || l.tags?.some((t) => t.id === agentId)), "agent sees only their leads", `${theirs.data?.total} of ${leads.data.total}`)
const notTheirs = leads.data.rows.find((l) => l.agent?.id !== agentId)
if (notTheirs) check((await call("GET", `/leads/${notTheirs.code}`, { token: at })).status === 404, "agent can't open someone else's lead")

// Sign out
for (const t of [ot, at]) await call("POST", "/auth/sign-out", { token: t })
check((await call("GET", "/me", { token: ot })).status === 401, "signed out → token stops working")

// Clean up: the test lead and everything on it, its opIds and the test's phone sessions
const tenant = await platformDb()("tenants").where({ code: owner.data.workspace.code }).first("dbName", "dbHost")
const db = tenantDb(tenant)
const lead = await db("leads").where({ code }).first("id")
if (lead) {
  const links = await db("contactLinks").where({ linkableType: "lead", linkableId: lead.id }).select("contactId")
  await db("leadActivities").where({ leadId: lead.id }).delete()
  await db("contactLinks").where({ linkableType: "lead", linkableId: lead.id }).delete()
  for (const { contactId } of links) if (!(await db("contactLinks").where({ contactId }).first("id"))) await db("contacts").where({ id: contactId }).delete()
  await db("leads").where({ id: lead.id }).delete()
  await db("activityLog").where({ action: "lead.created" }).where("summary", "like", `%(${code})`).delete()
}
// The test contact (by its test mobile, so an earlier run's leftover goes too)
for (const c of await db("contacts").where({ phone: "+923990001234" }).select("id", "code")) {
  await db("contactLinks").where({ contactId: c.id }).delete()
  await db("contacts").where({ id: c.id }).delete()
  await db("activityLog").whereIn("action", ["contact.created", "contact.updated"]).where("summary", "like", `%(${c.code})`).delete()
}
await db("activityLog").where({ action: "member.signed_in" }).where("summary", "like", "signed in on the iOS app%").where("createdAt", ">=", STARTED).delete()
await db("syncOps").whereIn("sessionId", [owner.data.sessionId, agent.data.sessionId]).delete()
await authDb()("sessions").where({ kind: "mobile", deviceName: device.name }).delete()
await closeAll()

console.log(failures ? `\n${failures} failed` : "\nAll passed")
process.exit(failures ? 1 : 0)
