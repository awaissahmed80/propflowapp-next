import "server-only"
import { live } from "@/server/db/records"
import { listBookingsWithLines, listReceipts } from "./queries"

// Sales › Reports, worked out on the server from what this person may see (Sales scope).
//   salesReport(ctx, key, { from, to, project }) → { rows, totals, chart? }
// Dates are "YYYY-MM-DD" (Pakistan time); from/to are inclusive. Point-in-time reports (aging,
// defaulters) ignore the period.

export const REPORTS = [
  { key: "sales-register", title: "Sales register", icon: "file-list-3-line", period: true, text: "Every booking made in the period, with price, received and who sold it" },
  { key: "collections", title: "Collections", icon: "wallet-3-line", period: true, text: "Money received in the period, by method, cleared and in clearing" },
  { key: "aging", title: "Receivables aging", icon: "hourglass-line", period: false, text: "What each buyer still owes, by how late it is" },
  { key: "defaulters", title: "Defaulters & overdue", icon: "alarm-warning-line", period: false, text: "Buyers behind on payments, oldest first, to call or send notices" },
  { key: "by-project", title: "Sales by project", icon: "community-line", period: true, text: "Bookings, value, received and outstanding for each project" },
  { key: "by-partner", title: "Sales by agent & dealer", icon: "team-line", period: true, text: "Who sold what in the period, and how much of it is collected" },
  { key: "cancellations", title: "Cancellations & refunds", icon: "close-circle-line", period: true, text: "Bookings canceled in the period, deductions and refunds due" },
  { key: "cheques", title: "Cheque register", icon: "bank-card-2-line", period: true, text: "Cheques and pay orders received: in clearing, cleared and bounced" },
]

const pkDay = (d) => (d ? new Date(new Date(d).getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10) : null)
const within = (d, from, to) => {
  const day = pkDay(d)
  return Boolean(day) && (!from || day >= from) && (!to || day <= to)
}
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const OPEN = (b) => !["cancelled", "refunded"].includes(b.status)

export async function salesReport(ctx, key, { from = null, to = null, project = null } = {}) {
  const inProject = (code) => !project || code === project

  if (key === "collections" || key === "cheques") {
    const receipts = (await listReceipts(ctx)).filter((r) => inProject(r.booking.project.code) && within(r.receivedOn, from, to))
    if (key === "cheques") {
      const rows = receipts
        .filter((r) => ["cheque", "pay-order"].includes(r.method))
        .map((r) => ({
          code: r.code,
          date: r.receivedOn,
          buyer: r.booking.buyer,
          booking: r.booking.code,
          project: r.booking.project.name,
          unit: r.booking.unit,
          method: r.method,
          chequeNo: r.chequeNo,
          bank: r.chequeBank,
          status: r.status,
          amount: r.amount,
        }))
      const by = (st) => rows.filter((r) => r.status === st)
      return {
        rows,
        totals: {
          count: rows.length,
          amount: sum(rows, (r) => r.amount),
          clearing: sum(by("clearing"), (r) => r.amount),
          cleared: sum(by("cleared"), (r) => r.amount),
          bounced: sum(by("bounced"), (r) => r.amount),
          bouncedCount: by("bounced").length,
        },
      }
    }
    const kept = receipts.filter((r) => r.status !== "cancelled")
    const rows = kept.map((r) => ({
      code: r.code,
      date: r.receivedOn,
      buyer: r.booking.buyer,
      booking: r.booking.code,
      project: r.booking.project.name,
      unit: r.booking.unit,
      method: r.method,
      reference: r.chequeNo ? `Cheque ${r.chequeNo}` : r.reference,
      status: r.status,
      amount: r.amount,
      by: r.by?.name ?? null,
    }))
    const methods = [...new Set(rows.map((r) => r.method))]
    return {
      rows,
      totals: {
        count: rows.length,
        amount: sum(
          rows.filter((r) => r.status !== "bounced"),
          (r) => r.amount,
        ),
        cleared: sum(
          rows.filter((r) => r.status === "cleared"),
          (r) => r.amount,
        ),
        clearing: sum(
          rows.filter((r) => r.status === "clearing"),
          (r) => r.amount,
        ),
        bounced: sum(
          rows.filter((r) => r.status === "bounced"),
          (r) => r.amount,
        ),
      },
      chart: methods
        .map((m) => ({
          method: m,
          amount: sum(
            rows.filter((r) => r.method === m && r.status !== "bounced"),
            (r) => r.amount,
          ),
        }))
        .sort((a, b) => b.amount - a.amount),
    }
  }

  const all = (await listBookingsWithLines(ctx)).filter((x) => inProject(x.booking.project.code))

  if (key === "sales-register") {
    const list = all.filter((x) => within(x.booking.bookedAt, from, to))
    const rows = list.map(({ booking: b }) => ({
      code: b.code,
      date: b.bookedAt,
      buyer: b.buyer.name,
      phone: b.buyer.phone,
      project: b.project.name,
      unit: b.unit.number,
      kind: b.kind,
      net: b.net,
      received: b.received,
      balance: b.balance,
      soldBy: (b.soldBy ?? b.agent)?.name ?? null,
      dealer: b.dealer,
      stage: b.stage,
      status: b.status,
    }))
    const open = rows.filter(OPEN)
    return { rows, totals: { count: open.length, canceled: rows.length - open.length, net: sum(open, (r) => r.net), received: sum(open, (r) => r.received), balance: sum(open, (r) => r.balance) } }
  }

  if (key === "aging") {
    const rows = all
      .filter(({ booking: b }) => OPEN(b) && b.balance > 0)
      .map(({ booking: b, lines }) => {
        const open = lines.filter((l) => l.balance > 0)
        const bucket = (lo, hi) =>
          sum(
            open.filter((l) => l.state === "overdue" && l.daysLate >= lo && l.daysLate <= hi),
            (l) => l.balance,
          )
        return {
          code: b.code,
          buyer: b.buyer.name,
          phone: b.buyer.phone,
          project: b.project.name,
          unit: b.unit.number,
          notDue: sum(
            open.filter((l) => l.state !== "overdue"),
            (l) => l.balance,
          ),
          d30: bucket(0, 30),
          d60: bucket(31, 60),
          d90: bucket(61, 90),
          d90plus: bucket(91, 1e6),
          overdue: sum(
            open.filter((l) => l.state === "overdue"),
            (l) => l.balance,
          ),
          // Owed but not on the schedule yet (e.g. a token booking without a payment plan)
          unscheduled: Math.max(0, b.balance - sum(open, (l) => l.balance)),
          total: b.balance,
        }
      })
    const t = (k) => sum(rows, (r) => r[k])
    return {
      rows,
      totals: { count: rows.length, unscheduled: t("unscheduled"), notDue: t("notDue"), d30: t("d30"), d60: t("d60"), d90: t("d90"), d90plus: t("d90plus"), overdue: t("overdue"), total: t("total") },
      chart: [
        ...(t("unscheduled") ? [{ bucket: "No plan yet", amount: t("unscheduled") }] : []),
        { bucket: "Not yet due", amount: t("notDue") },
        { bucket: "1–30 days", amount: t("d30") },
        { bucket: "31–60 days", amount: t("d60") },
        { bucket: "61–90 days", amount: t("d90") },
        { bucket: "Over 90 days", amount: t("d90plus") },
      ],
    }
  }

  if (key === "defaulters") {
    const list = all.filter(({ booking: b }) => OPEN(b) && b.overdueAmount > 0)
    const ids = list.map((x) => x.row.id)
    const last = ids.length ? await ctx.db("receipts").whereIn("bookingId", ids).where({ status: "cleared" }).whereNull("deletedAt").groupBy("bookingId").select("bookingId").max({ at: "receivedOn" }) : []
    const rows = list
      .map(({ booking: b, row, lines }) => {
        const late = lines.filter((l) => l.state === "overdue")
        return {
          code: b.code,
          buyer: b.buyer.name,
          phone: b.buyer.phone,
          project: b.project.name,
          unit: b.unit.number,
          handledBy: b.agent?.name ?? null,
          count: late.length,
          overdue: b.overdueAmount,
          daysLate: Math.max(0, ...late.map((l) => l.daysLate)),
          oldestDue: late[0]?.dueDate ?? null,
          lastPaid: last.find((x) => x.bookingId === row.id)?.at ?? null,
          status: b.status,
        }
      })
      .sort((a, b) => b.daysLate - a.daysLate)
    return { rows, totals: { count: rows.length, defaulters: rows.filter((r) => r.status === "defaulter").length, overdue: sum(rows, (r) => r.overdue) } }
  }

  if (key === "by-project" || key === "by-partner") {
    const sold = all.filter((x) => within(x.booking.bookedAt, from, to) && OPEN(x.booking))
    const groups = new Map()
    for (const { booking: b } of sold) {
      const g =
        key === "by-project"
          ? { key: b.project.code, name: b.project.name, type: null }
          : b.dealer
            ? { key: `dealer:${b.dealer}`, name: b.dealer, type: "Dealer" }
            : { key: `agent:${(b.soldBy ?? b.agent)?.name ?? "—"}`, name: (b.soldBy ?? b.agent)?.name ?? "No agent", type: "Agent" }
      const cur = groups.get(g.key) ?? { ...g, bookings: 0, value: 0, received: 0, balance: 0, overdue: 0 }
      cur.bookings += 1
      cur.value += b.net
      cur.received += b.received
      cur.balance += b.balance
      cur.overdue += b.overdueAmount
      groups.set(g.key, cur)
    }
    const rows = [...groups.values()].map((g) => ({ ...g, collectedPct: g.value ? Math.round((g.received / g.value) * 100) : 0, avg: g.bookings ? Math.round(g.value / g.bookings) : 0 })).sort((a, b) => b.value - a.value)
    return {
      rows,
      totals: { count: sum(rows, (r) => r.bookings), value: sum(rows, (r) => r.value), received: sum(rows, (r) => r.received), balance: sum(rows, (r) => r.balance), overdue: sum(rows, (r) => r.overdue) },
      chart: rows.slice(0, 12).map((r) => ({ name: r.name, value: r.value, received: r.received })),
    }
  }

  if (key === "cancellations") {
    const list = all.filter(({ booking: b, row }) => !OPEN(b) && within(row.cancelledAt ?? row.updatedAt, from, to))
    const rows = list.map(({ booking: b, row, people }) => ({
      code: b.code,
      buyer: b.buyer.name,
      project: b.project.name,
      unit: b.unit.number,
      date: row.cancelledAt,
      reason: row.cancelReason,
      net: b.net,
      paid: b.received,
      deductionPct: Number(row.deductionPct ?? 0),
      deduction: Math.max(0, b.received - Number(row.refundAmount ?? 0)),
      refund: Number(row.refundAmount ?? 0),
      status: b.status,
      by: people.get(row.cancelledBy)?.name ?? null,
    }))
    return {
      rows,
      totals: {
        count: rows.length,
        paid: sum(rows, (r) => r.paid),
        deduction: sum(rows, (r) => r.deduction),
        refund: sum(rows, (r) => r.refund),
        refundsDue: sum(
          rows.filter((r) => r.status === "cancelled"),
          (r) => r.refund,
        ),
      },
    }
  }

  return { rows: [], totals: {} }
}

export const reportProjects = (ctx) => live(ctx.db, "projects").orderBy("name").select("code", "name")
