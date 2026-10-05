import "server-only"
import { live } from "@/server/db/records"
import { platformDb, tenantDb } from "@/server/db/connections"
import { integrationOn } from "@/server/integrations"
import { readSettings } from "@/modules/portal/server/setup"
import { getLookups } from "@/modules/lookups/server"
import { openSecret } from "@/server/secret-box"
import { SMS_AUTOMATION_KEY, mergeAutomation, render, templateText } from "@/modules/integrations/sms/templates"
import { readSms, sendSms } from "./sms"

// Automatic SMS through the workspace's own gateway: installment reminders (days before, on the
// due date, days after if unpaid) and a message when a payment clears. Each is sent once per
// installment / receipt (sms_messages.template); a failed one is tried again the next day.
// Only between 9 am and 8 pm Pakistan time. Run by /api/cron/sms every 15 minutes (reminders once
// a day, receipts every run) or by hand from Settings › Integrations › SMS gateway.

const PKT = 5 * 3_600_000
// Bookings that get no reminders: closed ones, and ones on hold
const NO_REMINDERS = ["cancelled", "refunded", "on-hold"]
const pkNow = (now = new Date()) => new Date(now.getTime() + PKT)
export const pkDay = (now = new Date()) => pkNow(now).toISOString().slice(0, 10)
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
export const QUIET = { from: 9, to: 20 } // sending hours, PKT
export const inSendingHours = (now = new Date()) => {
  const h = pkNow(now).getUTCHours()
  return h >= QUIET.from && h < QUIET.to
}

const rs = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-US")}`
const dateText = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(typeof d === "string" ? `${d.slice(0, 10)}T00:00:00Z` : d))

export async function readAutomation(db) {
  const row = await db("settings").where({ key: SMS_AUTOMATION_KEY }).first("value")
  return mergeAutomation(typeof row?.value === "string" ? JSON.parse(row.value) : row?.value)
}
export async function writeAutomation(db, value, by = null) {
  await db("settings")
    .insert({ key: SMS_AUTOMATION_KEY, value: JSON.stringify(value), updatedAt: new Date(), updatedBy: by })
    .onConflict("key")
    .merge(["value", "updatedAt", "updatedBy"])
}

// Messages already sent (or sent today, when failed) for these subjects and templates
async function alreadySent(db, subjectType, ids, today) {
  if (!ids.length) return new Set()
  const rows = await db("smsMessages")
    .where({ subjectType })
    .whereIn("subjectId", ids)
    .whereNotNull("template")
    .where((q) => q.whereNot({ status: "failed" }).orWhere("createdAt", ">=", new Date(Date.parse(`${today}T00:00:00Z`) - PKT)))
    .select("subjectId", "template")
  return new Set(rows.map((r) => `${r.subjectId}:${r.template}`))
}

// The installments due a reminder today → [{ installmentId, template, phone, vars }]
//   before: due in 1…N days · due: due today · overdue: N…N+6 days late (a week's window, so a
//   missed day still sends, but switching it on doesn't message every old installment)
export async function dueReminders(db, tenant, automation, today = pkDay()) {
  const windows = [
    automation.before.on && ["installment-before", addDays(today, 1), addDays(today, automation.before.days)],
    automation.due.on && ["installment-due", today, today],
    automation.overdue.on && ["installment-overdue", addDays(today, -(automation.overdue.days + 6)), addDays(today, -automation.overdue.days)],
  ].filter(Boolean)
  if (!windows.length) return []
  const [company, unitName] = await Promise.all([companyName(tenant), unitNamer(db)])
  const out = []
  for (const [template, from, to] of windows) {
    const rows = await db("bookingInstallments as i")
      .join("bookings as b", "b.id", "i.bookingId")
      .join("units as u", "u.id", "b.unitId")
      .join("projects as p", "p.id", "b.projectId")
      .leftJoin("contacts as c", "c.id", "b.contactId")
      .whereNull("i.deletedAt")
      .whereNull("b.deletedAt")
      .whereNotIn("b.status", NO_REMINDERS)
      .whereNot("i.status", "paid")
      .whereRaw("i.amount - i.paid_amount > 0.5")
      .whereBetween("i.dueDate", [from, to])
      .select(
        "i.id",
        "i.number",
        "i.label",
        "i.dueDate",
        "i.amount",
        "i.paidAmount",
        "b.code as booking",
        "b.customerName",
        "b.customerPhone",
        "c.name as contactName",
        "c.phone as contactPhone",
        "u.number as unit",
        "u.type as unitType",
        "p.name as project",
      )
    const sent = await alreadySent(
      db,
      "installment",
      rows.map((r) => r.id),
      today,
    )
    for (const r of rows) {
      if (sent.has(`${r.id}:${template}`)) continue
      const phone = r.contactPhone || r.customerPhone
      if (!phone) continue
      out.push({
        subjectId: r.id,
        template,
        phone,
        vars: {
          buyer: r.contactName || r.customerName,
          amount: rs(Number(r.amount) - Number(r.paidAmount)),
          installment: r.label || `Installment ${r.number}`,
          due_date: dateText(r.dueDate),
          unit: unitName(r.unitType, r.unit),
          project: r.project,
          booking: r.booking,
          company,
        },
      })
    }
  }
  return out
}

// Payments that cleared since receipt messages were switched on and haven't had one
export async function dueReceipts(db, tenant, automation, today = pkDay()) {
  if (!automation.receipt.on || !automation.receipt.since) return []
  const rows = await db("receipts as r")
    .join("bookings as b", "b.id", "r.bookingId")
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .whereNull("r.deletedAt")
    .where("r.status", "cleared")
    .where((q) => q.where("r.clearedAt", ">=", new Date(automation.receipt.since)).orWhere((w) => w.whereNull("r.clearedAt").where("r.createdAt", ">=", new Date(automation.receipt.since))))
    .select(
      "r.id",
      "r.code",
      "r.amount",
      "r.receivedOn",
      "b.id as bookingId",
      "b.code as booking",
      "b.netPrice",
      "b.agreedPrice",
      "b.customerName",
      "b.customerPhone",
      "c.name as contactName",
      "c.phone as contactPhone",
      "u.number as unit",
      "u.type as unitType",
      "p.name as project",
    )
  const sent = await alreadySent(
    db,
    "receipt",
    rows.map((r) => r.id),
    today,
  )
  const todo = rows.filter((r) => !sent.has(`${r.id}:receipt`) && (r.contactPhone || r.customerPhone))
  if (!todo.length) return []
  const paid = await db("receipts")
    .whereIn("bookingId", [...new Set(todo.map((r) => r.bookingId))])
    .where({ status: "cleared" })
    .whereNull("deletedAt")
    .groupBy("bookingId")
    .select("bookingId")
    .sum({ s: "amount" })
  const [company, unitName] = await Promise.all([companyName(tenant), unitNamer(db)])
  return todo.map((r) => ({
    subjectId: r.id,
    template: "receipt",
    phone: r.contactPhone || r.customerPhone,
    vars: {
      buyer: r.contactName || r.customerName,
      amount: rs(r.amount),
      receipt: r.code,
      date: dateText(r.receivedOn),
      unit: unitName(r.unitType, r.unit),
      project: r.project,
      booking: r.booking,
      balance: rs(Math.max(0, Number(r.netPrice ?? r.agreedPrice) - Number(paid.find((p) => p.bookingId === r.bookingId)?.s ?? 0))),
      company,
    },
  }))
}

// "Plot 108", "Shop G-5" from the unit-type list (left as it is when the number already says it)
async function unitNamer(db) {
  const types = (await getLookups(db, ["unit-type"]))["unit-type"]
  return (type, number) => {
    const label = types.find((t) => t.value === type)?.label
    return label && !String(number).toLowerCase().includes(label.toLowerCase()) ? `${label} ${number}` : String(number)
  }
}

async function companyName(tenant) {
  const s = await readSettings(tenant, ["company_name"])
  return s.company_name || tenant.name
}

// Ready to send automatically: the integration on, a working gateway
export async function smsReady(site) {
  if (!(await integrationOn(site.tenant.id, "sms"))) return false
  const s = await readSms(site.db)
  return Boolean(s && openSecret(s.apiKey))
}

// Send a list from dueReminders / dueReceipts → { sent, failed, errors: [first few] }
async function sendAll(site, items, automation, by) {
  const out = { sent: 0, failed: 0, errors: [] }
  for (const item of items) {
    const { body } = templateText(automation, item.template)
    const r = await sendSms(site, { to: item.phone, text: render(body, item.vars), subject: { type: item.template === "receipt" ? "receipt" : "installment", id: item.subjectId }, template: item.template, by })
    if (r.ok) out.sent += 1
    else {
      out.failed += 1
      if (out.errors.length < 3) out.errors.push(r.error)
      // No balance or a wrong key: the rest would fail the same way
      if (["INSUFFICIENT_BALANCE", "LOW_BALANCE", "INVALID_API_KEY", "AUTHENTICATION_FAILED", "IP_NOT_ALLOWED", "ACCOUNT_DISABLED"].includes(r.code)) break
    }
  }
  return out
}

// One workspace's run → { reminders, receipts } (each { sent, failed, errors }) | { skipped }
//   reminders: also run today's reminders (once a day unless force)
export async function runSmsAutomation(site, { now = new Date(), reminders = true, force = false, by = null } = {}) {
  if (!inSendingHours(now)) return { skipped: `SMS are sent between ${QUIET.from} am and ${QUIET.to - 12} pm Pakistan time.` }
  if (!(await smsReady(site))) return { skipped: "Connect a working SMS gateway first." }
  const automation = await readAutomation(site.db)
  const today = pkDay(now)
  const result = { reminders: null, receipts: null }
  if (reminders && (force || automation.lastReminderDay !== today)) {
    result.reminders = await sendAll(site, await dueReminders(site.db, site.tenant, automation, today), automation, by)
    await writeAutomation(site.db, { ...automation, lastReminderDay: today })
  }
  result.receipts = await sendAll(site, await dueReceipts(site.db, site.tenant, automation, today), automation, by)
  return result
}

// The scheduled run for every workspace with automatic SMS on → workspaces that sent something
export async function runAllSmsAutomation(now = new Date()) {
  if (!inSendingHours(now)) return 0
  const tenants = await live(platformDb(), "tenants").whereIn("status", ["trial", "active", "past_due"]).select("id", "code", "name", "dbName", "dbHost")
  let n = 0
  for (const tenant of tenants) {
    try {
      const db = tenantDb(tenant)
      const row = await db("settings").where({ key: SMS_AUTOMATION_KEY }).first("value")
      if (!row) continue
      const a = mergeAutomation(typeof row.value === "string" ? JSON.parse(row.value) : row.value)
      if (!(a.before.on || a.due.on || a.overdue.on || a.receipt.on)) continue
      const r = await runSmsAutomation({ db, tenant }, { now })
      if ((r.reminders?.sent ?? 0) + (r.receipts?.sent ?? 0)) n += 1
    } catch (err) {
      console.error(`SMS automation ${tenant.code}:`, err.message)
    }
  }
  return n
}

// What the next run would send, for the preview in Settings (no SMS sent)
export async function previewSmsAutomation(site, now = new Date()) {
  const automation = await readAutomation(site.db)
  const today = pkDay(now)
  const [reminders, receipts] = await Promise.all([dueReminders(site.db, site.tenant, automation, today), dueReceipts(site.db, site.tenant, automation, today)])
  const items = [...reminders, ...receipts]
  return {
    count: items.length,
    byTemplate: items.reduce((acc, i) => ({ ...acc, [i.template]: (acc[i.template] ?? 0) + 1 }), {}),
    sample: items.slice(0, 5).map((i) => ({ template: i.template, phone: i.phone, text: render(templateText(automation, i.template).body, i.vars) })),
    lastReminderDay: automation.lastReminderDay,
    inHours: inSendingHours(now),
  }
}
