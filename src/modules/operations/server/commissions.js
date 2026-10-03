import "server-only"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { ledgerFor } from "./ledger"
import { salesSettings } from "./settings"

// Commissions, worked out from bookings. A booking earns its dealer (or, with no dealer, the
// agent who sold it: sold_by, never the current handler) a % of the net price: the rate saved on
// the booking, else the dealer's agreed rate, else the Sales default. Statuses:
//   pending   waiting for the trigger in Sales settings (token / down payment / allotment)
//   payable   ready to pay
//   paid      in a payout
//   void      booking canceled before it was paid
//   clawback  booking canceled after it was paid: to recover from the partner
//   recovered clawback collected
// Who sees what: the sales.commissions grant (none | own | all). "own" is their own commission
// as an agent, or their firm's for dealer logins.

const CLOSED = ["cancelled", "refunded"]

// The rate a new booking gets (saved on it, so later changes to defaults don't move it)
export async function commissionPctFor(db, dealerId) {
  const settings = await salesSettings(db)
  if (dealerId) {
    const d = await live(db, "dealers").where({ id: dealerId }).first("commissionPct")
    if (d?.commissionPct != null) return Number(d.commissionPct)
    return settings.dealerCommissionPct
  }
  return settings.agentCommissionPct
}

function triggered(trigger, b, money) {
  if (trigger === "allotment") return Boolean(b.allotmentNo)
  if (trigger === "token") return (money?.received ?? 0) > 0
  // Down payment in: the down (or full) payment line is paid; tokens count toward it
  const down = money?.lines.find((l) => l.kind === "down" || l.kind === "full")
  return down ? down.state === "paid" : Boolean(b.allotmentNo)
}

// Dealer and commission rate for a new booking sold by this user: their firm when they're a
// dealer's login → { dealerId, commissionPct }
export async function dealerTerms(db, userId) {
  const m = userId ? await live(db, "members").where({ userId }).first("dealerId") : null
  const dealerId = m?.dealerId ?? null
  return { dealerId, commissionPct: await commissionPctFor(db, dealerId) }
}

// What this person may see → { level: "none" | "own" | "all", dealerId }
export async function commissionAccess(ctx) {
  const level = ctx.grant("operations.commissions") ?? "none"
  const me = level === "own" ? await live(ctx.db, "members").where({ userId: ctx.user.id }).first("dealerId") : null
  return { level, dealerId: me?.dealerId ?? null }
}

// Every booking's commission this person may see (newest first) → { rows, settings }
export async function commissionRows(ctx, { bookingIds = null } = {}) {
  const access = await commissionAccess(ctx)
  if (access.level === "none") return { rows: [], settings: await salesSettings(ctx.db) }
  const q = ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("units as u", "u.id", "b.unitId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .leftJoin("dealers as d", "d.id", "b.dealerId")
    .orderBy("b.bookedAt", "desc")
    .select(
      "b.id",
      "b.code",
      "b.stage",
      "b.status",
      "b.netPrice",
      "b.agreedPrice",
      "b.bookedAt",
      "b.allotmentNo",
      "b.commissionPct",
      "b.dealerId",
      "b.soldBy",
      "b.agentId",
      "b.customerName",
      "c.name as buyer",
      "p.code as projectCode",
      "p.name as project",
      "u.number as unit",
      "d.code as dealerCode",
      "d.name as dealerName",
      "d.commissionPct as dealerPct",
    )
  if (access.level === "own") {
    if (access.dealerId) q.where("b.dealerId", access.dealerId)
    else q.whereNull("b.dealerId").where((w) => w.where("b.soldBy", ctx.user.id).orWhere((x) => x.whereNull("b.soldBy").where("b.agentId", ctx.user.id)))
  }
  if (bookingIds) q.whereIn("b.id", bookingIds.length ? bookingIds : [0])
  const bookings = await q
  const ids = bookings.map((b) => b.id)
  const [settings, money, items, people] = await Promise.all([
    salesSettings(ctx.db),
    ledgerFor(ctx.db, bookings),
    ids.length
      ? ctx
          .db("commissionPayoutItems as i")
          .join("commissionPayouts as po", "po.id", "i.payoutId")
          .whereNull("po.deletedAt")
          .whereIn("i.bookingId", ids)
          .select("i.bookingId", "i.amount", "i.pct", "i.recoveredAt", "po.code", "po.paidOn")
      : [],
    peopleByIds(bookings.map((b) => b.soldBy ?? b.agentId)),
  ])

  const rows = bookings.map((b) => {
    const net = Number(b.netPrice ?? b.agreedPrice ?? 0)
    const paid = items.find((i) => i.bookingId === b.id)
    const pct = paid ? Number(paid.pct) : b.commissionPct != null ? Number(b.commissionPct) : b.dealerId ? (b.dealerPct != null ? Number(b.dealerPct) : settings.dealerCommissionPct) : settings.agentCommissionPct
    const amount = paid ? Number(paid.amount) : Math.round((net * pct) / 100)
    const closed = CLOSED.includes(b.status)
    const status = closed ? (paid ? (paid.recoveredAt ? "recovered" : "clawback") : "void") : paid ? "paid" : triggered(settings.commissionTrigger, b, money.get(b.id)) ? "payable" : "pending"
    const agent = people.get(b.soldBy ?? b.agentId)
    return {
      bookingId: b.id,
      code: b.code,
      stage: b.stage,
      status: b.status,
      buyer: b.buyer ?? b.customerName,
      project: { code: b.projectCode, name: b.project },
      unit: b.unit,
      bookedAt: b.bookedAt,
      net,
      pct,
      amount,
      commission: status,
      partner: b.dealerId
        ? { type: "dealer", key: `dealer:${b.dealerCode}`, code: b.dealerCode, name: b.dealerName, dealerId: b.dealerId }
        : { type: "agent", key: `agent:${b.soldBy ?? b.agentId ?? 0}`, name: agent?.name ?? "No agent", userId: b.soldBy ?? b.agentId ?? null, avatarUrl: agent?.avatarUrl ?? null },
      payout: paid ? { code: paid.code, paidOn: paid.paidOn } : null,
    }
  })
  return { rows, settings }
}

// Payouts this person may see (newest first)
export async function listPayouts(ctx) {
  const access = await commissionAccess(ctx)
  if (access.level === "none") return []
  const q = live(ctx.db, "commissionPayouts").orderBy("paidOn", "desc").orderBy("id", "desc").limit(500)
  if (access.level === "own") {
    if (access.dealerId) q.where({ partnerType: "dealer", dealerId: access.dealerId })
    else q.where({ partnerType: "agent", userId: ctx.user.id })
  }
  const payouts = await q
  const ids = payouts.map((p) => p.id)
  const [items, dealers, people, accounts] = await Promise.all([
    ids.length
      ? ctx
          .db("commissionPayoutItems as i")
          .join("bookings as b", "b.id", "i.bookingId")
          .leftJoin("contacts as c", "c.id", "b.contactId")
          .leftJoin("units as u", "u.id", "b.unitId")
          .leftJoin("projects as p", "p.id", "b.projectId")
          .whereIn("i.payoutId", ids)
          .select("i.payoutId", "i.amount", "i.pct", "b.code", "b.netPrice", "c.name as buyer", "b.customerName", "u.number as unit", "p.name as project")
      : [],
    ctx
      .db("dealers")
      .whereIn(
        "id",
        payouts
          .map((p) => p.dealerId)
          .filter(Boolean)
          .concat([0]),
      )
      .select("id", "code", "name", "ntn", "address", "city", "phone"),
    peopleByIds(payouts.map((p) => p.userId).concat(payouts.map((p) => p.createdBy))),
    ctx
      .db("accounts")
      .whereIn(
        "id",
        payouts
          .map((p) => p.accountId)
          .filter(Boolean)
          .concat([0]),
      )
      .select("id", "name", "bankName"),
  ])
  return payouts.map((p) => {
    const dealer = dealers.find((d) => d.id === p.dealerId)
    const user = people.get(p.userId)
    const account = accounts.find((a) => a.id === p.accountId)
    return {
      code: p.code,
      paidOn: p.paidOn,
      partner:
        p.partnerType === "dealer"
          ? { type: "dealer", name: dealer?.name ?? "Dealer", code: dealer?.code, ntn: dealer?.ntn, address: [dealer?.address, dealer?.city].filter(Boolean).join(", "), phone: dealer?.phone }
          : { type: "agent", name: user?.name ?? "Agent" },
      method: p.method,
      account: account ? [account.name, account.bankName].filter(Boolean).join(" · ") : null,
      reference: p.reference,
      gross: Number(p.gross),
      whtPct: Number(p.whtPct),
      wht: Number(p.wht),
      net: Number(p.net),
      notes: p.notes,
      by: people.get(p.createdBy)?.name ?? null,
      items: items
        .filter((i) => i.payoutId === p.id)
        .map((i) => ({ code: i.code, buyer: i.buyer ?? i.customerName, unit: i.unit, project: i.project, net: Number(i.netPrice ?? 0), pct: Number(i.pct), amount: Number(i.amount) })),
    }
  })
}
