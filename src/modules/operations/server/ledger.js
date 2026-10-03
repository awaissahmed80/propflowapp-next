import "server-only"
import { live } from "@/server/db/records"
import { salesSettings } from "./settings"

// A booking's money, worked out the same way everywhere (pages, actions, My Desk):
//   - cleared receipts pay schedule lines oldest first (a token counts towards the down payment)
//   - each line: paid | partial | overdue | due-soon (30 days) | upcoming
//   - the booking's automatic status: defaulter (3+ lines overdue, or the oldest 90+ days late),
//     overdue, or current. Statuses set by hand (on hold, transferred, cancelled, refunded) stay.

const DAY = 86_400_000
export const MANUAL_STATUSES = ["on-hold", "transferred", "cancelled", "refunded"]
const today = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())}T00:00:00+05:00`)

// lines: [{ id, number, kind, label, dueDate, amount }] in schedule order; paid: total cleared
export function allocate(lines, paid, { now = today(), cancelled = false } = {}) {
  let left = Number(paid)
  const sorted = [...lines].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate) || a.number - b.number)
  const out = sorted.map((l) => {
    const amount = Number(l.amount)
    const applied = Math.max(0, Math.min(amount, left))
    left -= applied
    const balance = Math.round((amount - applied) * 100) / 100
    const due = new Date(l.dueDate)
    let state = "upcoming"
    if (cancelled) state = "cancelled"
    else if (balance <= 0) state = "paid"
    else if (due < now) state = "overdue"
    else if (applied > 0) state = "partial"
    else if (due - now <= 30 * DAY) state = "due-soon"
    const daysLate = state === "overdue" ? Math.floor((now - due) / DAY) : 0
    return { ...l, amount, paid: applied, balance: Math.max(0, balance), state, daysLate }
  })
  return { lines: out, unapplied: Math.max(0, Math.round(left * 100) / 100) }
}

// Totals for a booking from its allocated lines
export function summarize(lines, { net, received, clearing = 0 }) {
  const overdue = lines.filter((l) => l.state === "overdue")
  const next = lines.find((l) => l.balance > 0 && l.state !== "overdue")
  const oldest = overdue.reduce((m, l) => Math.max(m, l.daysLate), 0)
  return {
    net: Number(net),
    received,
    clearing,
    balance: Math.max(0, Math.round((Number(net) - received) * 100) / 100),
    paidPct: Number(net) > 0 ? Math.min(100, Math.round((received / Number(net)) * 100)) : 0,
    overdueAmount: overdue.reduce((s, l) => s + l.balance, 0),
    overdueCount: overdue.length,
    oldestDaysLate: oldest,
    nextDue: next ? { label: next.label, dueDate: next.dueDate, balance: next.balance } : null,
    linesLeft: lines.filter((l) => l.balance > 0).length,
  }
}

// The automatic status for a booking that isn't on a hand-set one
//   rules: { defaulterLines, defaulterDays } from Sales › Settings
export function autoStatus(summary, rules = { defaulterLines: 3, defaulterDays: 90 }) {
  if (summary.overdueCount >= rules.defaulterLines || summary.oldestDaysLate >= rules.defaulterDays) return "defaulter"
  if (summary.overdueCount > 0) return "overdue"
  return "current"
}

// Re-apply receipts to a booking's lines and refresh its status (and Token → Booking & KYC once
// money has come in). Call inside the transaction that changed its receipts or schedule.
export async function refreshBooking(trx, bookingId) {
  const b = await trx("bookings").where({ id: bookingId }).first()
  if (!b) return null
  const [lines, receipts] = await Promise.all([
    trx("bookingInstallments").where({ bookingId }).whereNull("deletedAt").orderBy("dueDate").orderBy("number"),
    trx("receipts").where({ bookingId }).whereNull("deletedAt").select("amount", "status"),
  ])
  const received = receipts.filter((r) => r.status === "cleared").reduce((s, r) => s + Number(r.amount), 0)
  const cancelled = b.status === "cancelled" || b.status === "refunded"
  const { lines: done } = allocate(lines, received, { cancelled })
  for (const l of done) {
    const status = l.balance <= 0 ? "paid" : l.paid > 0 ? "partial" : "due"
    if (Number(l.paidAmount) !== l.paid || l.status !== status) await trx("bookingInstallments").where({ id: l.id }).update({ paidAmount: l.paid, status })
  }
  const summary = summarize(done, { net: b.netPrice ?? b.agreedPrice, received })
  const patch = {}
  if (!MANUAL_STATUSES.includes(b.status)) {
    const status = autoStatus(summary, await salesSettings(trx))
    if (status !== b.status) patch.status = status
  }
  if (b.stage === "token" && received > 0) patch.stage = "booking-kyc"
  if (Object.keys(patch).length)
    await trx("bookings")
      .where({ id: bookingId })
      .update({ ...patch, updatedAt: new Date() })
  return { ...summary, status: patch.status ?? b.status, stage: patch.stage ?? b.stage }
}

// Allocated lines and totals for many bookings at once (lists, overview, due lists)
export async function ledgerFor(db, bookings) {
  const ids = bookings.map((b) => b.id)
  if (!ids.length) return new Map()
  const [lines, receipts] = await Promise.all([
    live(db, "bookingInstallments").whereIn("bookingId", ids).orderBy("dueDate").orderBy("number"),
    live(db, "receipts").whereIn("bookingId", ids).select("bookingId", "amount", "status"),
  ])
  const out = new Map()
  for (const b of bookings) {
    const mine = receipts.filter((r) => r.bookingId === b.id)
    const received = mine.filter((r) => r.status === "cleared").reduce((s, r) => s + Number(r.amount), 0)
    const clearing = mine.filter((r) => r.status === "clearing").reduce((s, r) => s + Number(r.amount), 0)
    const { lines: done } = allocate(
      lines.filter((l) => l.bookingId === b.id),
      received,
      { cancelled: b.status === "cancelled" || b.status === "refunded" },
    )
    out.set(b.id, { lines: done, ...summarize(done, { net: b.netPrice ?? b.agreedPrice, received, clearing }) })
  }
  return out
}
