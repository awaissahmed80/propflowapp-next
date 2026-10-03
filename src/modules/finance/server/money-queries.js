import "server-only"
import { live } from "@/server/db/records"
import { ledgerFor } from "@/modules/operations/server/ledger"
import { ACCOUNTS, financialYearOf } from "../constants"

// Reads for Finance's money-in and money-out registers: receipts across every booking, cheques
// in clearing, refunds owed, vendors and payment requests. Finance keeps one set of books, so
// nothing here is scoped by who handles a booking.

const n = (v) => Number(v ?? 0)
const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// Cash and bank accounts money goes in or out of, the default first in line
export const moneyAccounts = (ctx) =>
  live(ctx.db, "accounts")
    .whereIn("kind", ["cash", "bank"])
    .where({ isActive: true })
    .orderBy("sortOrder")
    .orderBy("code")
    .select("id", "code", "name", "kind", "bankName", "accountTitle", "accountNumber", "iban", "branch", "isDefault")

export const projectOptions = (ctx) => live(ctx.db, "projects").orderBy("name").select("code", "name")

// Vouchers posted for records, by source id → Map(id → [{ code, event, status }])
async function vouchersFor(db, sourceType, ids) {
  if (!ids.length) return new Map()
  const rows = await live(db, "vouchers").where({ sourceType }).whereIn("sourceId", ids).orderBy("voucherDate").orderBy("id").select("sourceId", "code", "event", "status", "amount")
  const out = new Map()
  for (const v of rows) out.set(v.sourceId, [...(out.get(v.sourceId) ?? []), { code: v.code, event: v.event, status: v.status, amount: n(v.amount) }])
  return out
}

// Open approval requests by record → Map(subjectId → { code, type, createdAt })
async function openApprovals(db, subjectType, ids) {
  if (!ids.length) return new Map()
  const rows = await live(db, "approvals").where({ subjectType, status: "pending" }).whereIn("subjectId", ids).orderBy("id").select("subjectId", "code", "type", "createdAt")
  return new Map(rows.map((a) => [a.subjectId, { code: a.code, type: a.type, createdAt: a.createdAt }]))
}

const receiptQuery = (ctx) =>
  ctx
    .db("receipts as r")
    .whereNull("r.deletedAt")
    .join("bookings as b", "b.id", "r.bookingId")
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .leftJoin("accounts as a", "a.id", "r.accountId")
    .select(
      "r.id",
      "r.code",
      "r.receivedOn",
      "r.amount",
      "r.method",
      "r.reference",
      "r.chequeNo",
      "r.chequeBank",
      "r.chequeDate",
      "r.status",
      "r.notes",
      "r.clearedAt",
      "r.bouncedAt",
      "r.createdAt",
      "b.code as bookingCode",
      "b.customerName",
      "c.name as contactName",
      "u.number as unitNumber",
      "p.code as projectCode",
      "p.name as projectName",
      "a.id as accountId",
      "a.name as accountName",
    )

function shapeReceipt(r, vouchers, approval) {
  return {
    code: r.code,
    receivedOn: r.receivedOn,
    amount: n(r.amount),
    method: r.method,
    reference: r.reference ?? "",
    chequeNo: r.chequeNo ?? "",
    chequeBank: r.chequeBank ?? "",
    chequeDate: r.chequeDate ?? null,
    status: r.status,
    notes: r.notes ?? "",
    clearedAt: r.clearedAt ?? null,
    bouncedAt: r.bouncedAt ?? null,
    account: r.accountId ? { id: r.accountId, name: r.accountName } : null,
    booking: { code: r.bookingCode, buyer: r.contactName ?? r.customerName, unit: r.unitNumber, project: { code: r.projectCode, name: r.projectName } },
    vouchers: vouchers ?? [],
    approval: approval ?? null,
  }
}

// Every receipt on every booking, newest first, with its vouchers
export async function financeReceipts(ctx) {
  const rows = await receiptQuery(ctx).orderBy("r.receivedOn", "desc").orderBy("r.id", "desc").limit(10000)
  const ids = rows.map((r) => r.id)
  const [vouchers, approvals] = await Promise.all([vouchersFor(ctx.db, "receipt", ids), openApprovals(ctx.db, "receipt", ids)])
  return rows.map((r) => shapeReceipt(r, vouchers.get(r.id), approvals.get(r.id)))
}

// Cheques and pay orders: those in clearing (with any open request to clear or bounce them) and
// the last 180 days of cleared and bounced ones
export async function chequeRegister(ctx) {
  const since = new Date(Date.now() - 180 * 86_400_000)
  const [waiting, done] = await Promise.all([
    receiptQuery(ctx).where("r.status", "clearing").orderBy("r.receivedOn").orderBy("r.id"),
    receiptQuery(ctx)
      .whereIn("r.status", ["cleared", "bounced"])
      .whereIn("r.method", ["cheque", "pay-order"])
      .where((q) => q.where("r.clearedAt", ">=", since).orWhere("r.bouncedAt", ">=", since))
      .orderBy("r.updatedAt", "desc")
      .limit(1000),
  ])
  const ids = [...waiting, ...done].map((r) => r.id)
  const [vouchers, approvals] = await Promise.all([vouchersFor(ctx.db, "receipt", ids), openApprovals(ctx.db, "receipt", ids)])
  const shape = (r) => shapeReceipt(r, vouchers.get(r.id), approvals.get(r.id))
  return { clearing: waiting.map(shape), history: done.map(shape) }
}

// Open bookings a payment can be taken on: what's left to pay (money in clearing or waiting for
// approval counts as coming) and the next installment due
export async function receivableBookings(ctx) {
  const rows = await ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .whereNotIn("b.status", ["cancelled", "refunded"])
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .orderBy("b.bookedAt", "desc")
    .limit(5000)
    .select("b.id", "b.code", "b.status", "b.netPrice", "b.agreedPrice", "b.customerName", "c.name as contactName", "c.phone as contactPhone", "b.customerPhone", "u.number as unitNumber", "p.name as projectName")
  const [money, pending] = await Promise.all([
    ledgerFor(ctx.db, rows),
    rows.length
      ? live(ctx.db, "receipts")
          .where({ status: "pending" })
          .whereIn(
            "bookingId",
            rows.map((b) => b.id),
          )
          .groupBy("bookingId")
          .select("bookingId")
          .sum({ s: "amount" })
      : [],
  ])
  const waiting = new Map(pending.map((p) => [p.bookingId, n(p.s)]))
  return rows
    .map((b) => {
      const m = money.get(b.id)
      const net = n(b.netPrice ?? b.agreedPrice)
      const left = Math.max(0, Math.round((net - (m?.received ?? 0) - (m?.clearing ?? 0) - (waiting.get(b.id) ?? 0)) * 100) / 100)
      const next = m?.lines.find((l) => l.balance > 0)
      return {
        code: b.code,
        buyer: b.contactName ?? b.customerName,
        phone: b.contactPhone ?? b.customerPhone ?? "",
        unit: b.unitNumber,
        project: b.projectName,
        net,
        left,
        overdue: m?.overdueAmount ?? 0,
        next: next ? { label: next.label ?? `Installment ${next.number}`, dueDate: next.dueDate, balance: next.balance, state: next.state } : null,
      }
    })
    .filter((b) => b.left > 0)
}

// Canceled bookings: what each buyer is owed, what's been refunded (and by which vouchers), and
// any refund waiting for approval
export async function refundRegister(ctx) {
  const rows = await ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .whereIn("b.status", ["cancelled", "refunded"])
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .orderBy("b.cancelledAt", "desc")
    .limit(5000)
    .select(
      "b.id",
      "b.code",
      "b.status",
      "b.refundAmount",
      "b.deductionPct",
      "b.cancelledAt",
      "b.cancelReason",
      "b.customerName",
      "b.customerPhone",
      "c.name as contactName",
      "c.phone as contactPhone",
      "u.number as unitNumber",
      "p.name as projectName",
    )
  const ids = rows.map((b) => b.id)
  const [refunds, approvals] = await Promise.all([
    ids.length
      ? live(ctx.db, "vouchers")
          .where({ sourceType: "booking", event: "refund" })
          .whereIn("sourceId", ids)
          .whereNot({ status: "void" })
          .orderBy("voucherDate")
          .select("sourceId", "code", "status", "amount", "voucherDate", "chequeNo", "reference")
      : [],
    openApprovals(ctx.db, "booking", ids),
  ])
  return rows.map((b) => {
    const paid = refunds.filter((v) => v.sourceId === b.id && v.status === "posted")
    const refunded = paid.reduce((s, v) => s + n(v.amount), 0)
    const owed = n(b.refundAmount)
    const approval = approvals.get(b.id)
    return {
      code: b.code,
      status: b.status,
      buyer: b.contactName ?? b.customerName,
      phone: b.contactPhone ?? b.customerPhone ?? "",
      unit: b.unitNumber,
      project: b.projectName,
      cancelledAt: b.cancelledAt,
      reason: b.cancelReason ?? "",
      deductionPct: n(b.deductionPct),
      owed,
      refunded,
      left: b.status === "cancelled" ? Math.max(0, Math.round((owed - refunded) * 100) / 100) : 0,
      payments: paid.map((v) => ({ code: v.code, amount: n(v.amount), date: v.voucherDate, chequeNo: v.chequeNo ?? "", reference: v.reference ?? "" })),
      approval: approval?.type === "refund" ? approval : null,
    }
  })
}

// Vendors with what they were paid this financial year (gross, from posted vouchers) and the
// income tax withheld on those payments
export async function vendorRegister(ctx) {
  const fy = financialYearOf()
  const [vendors, wht] = await Promise.all([
    live(ctx.db, "vendors").leftJoin("accounts as a", "a.id", "vendors.accountId").orderBy("vendors.name").select("vendors.*", "a.code as accountCode", "a.name as accountName"),
    live(ctx.db, "accounts").where({ code: ACCOUNTS.wht }).first("id"),
  ])
  const ids = vendors.map((v) => v.id)
  const [paid, withheld] = ids.length
    ? await Promise.all([
        live(ctx.db, "vouchers")
          .where({ status: "posted" })
          .whereIn("vendorId", ids)
          .whereBetween("voucherDate", [fy.start, fy.end])
          .groupBy("vendorId")
          .select("vendorId")
          .sum({ s: "amount" })
          .count({ c: "id" })
          .max({ last: "voucherDate" }),
        wht
          ? ctx
              .db("voucherLines as l")
              .join("vouchers as v", "v.id", "l.voucherId")
              .whereNull("v.deletedAt")
              .where({ "v.status": "posted", "l.accountId": wht.id })
              .whereIn("v.vendorId", ids)
              .whereBetween("v.voucherDate", [fy.start, fy.end])
              .groupBy("v.vendorId")
              .select("v.vendorId")
              .sum({ s: "l.credit" })
          : [],
      ])
    : [[], []]
  const paidBy = new Map(paid.map((p) => [p.vendorId, p]))
  const whtBy = new Map(withheld.map((p) => [p.vendorId, n(p.s)]))
  return {
    fy: fy.label,
    vendors: vendors.map((v) => {
      const p = paidBy.get(v.id)
      return {
        code: v.code,
        name: v.name,
        category: v.category ?? "",
        accountId: v.accountId ?? null,
        account: v.accountId ? { code: v.accountCode, name: v.accountName } : null,
        whtPct: n(v.whtPct),
        ntn: v.ntn ?? "",
        cnic: v.cnic ?? "",
        phone: v.phone ?? "",
        email: v.email ?? "",
        address: v.address ?? "",
        bankName: v.bankName ?? "",
        accountTitle: v.accountTitle ?? "",
        accountNumber: v.accountNumber ?? "",
        notes: v.notes ?? "",
        isActive: Boolean(v.isActive),
        paid: n(p?.s),
        payments: Number(p?.c ?? 0),
        lastPaid: p?.last ?? null,
        withheld: whtBy.get(v.id) ?? 0,
      }
    }),
  }
}

// Accounts a vendor is usually charged to: expenses, and assets that aren't cash or bank (advances, work in progress)
export const chargeAccounts = (ctx) => live(ctx.db, "accounts").where({ isHeader: false, isActive: true }).whereIn("type", ["expense", "asset"]).whereNull("kind").orderBy("code").select("id", "code", "name", "type")

// ---------- payment requests ----------

const requestQuery = (ctx) =>
  ctx
    .db("paymentRequests as q")
    .whereNull("q.deletedAt")
    .leftJoin("bookings as b", "b.id", "q.bookingId")
    .leftJoin("units as u", "u.id", "b.unitId")
    .leftJoin("projectBlocks as k", "k.id", "u.blockId")
    .leftJoin("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "q.contactId")
    .leftJoin("accounts as a", "a.id", "q.accountId")
    .select(
      "q.*",
      "b.code as bookingCode",
      "b.customerName",
      "b.customerPhone",
      "b.status as bookingStatus",
      "u.number as unitNumber",
      "k.name as blockName",
      "p.name as projectName",
      "c.name as contactName",
      "c.phone as contactPhone",
      "c.cnic as contactCnic",
      "c.guardianRelation",
      "c.guardianName",
      "c.address as contactAddress",
      "c.city as contactCity",
      "a.name as accountName",
      "a.bankName",
      "a.accountTitle",
      "a.accountNumber",
      "a.iban",
      "a.branch",
    )

// Issued requests whose installments are now all paid turn Paid (worked out from the booking's
// ledger, so cleared payments from anywhere count). Requests with only fees stay as they are.
async function settlePaid(ctx, rows) {
  const open = rows.filter((q) => q.status === "issued" && q.bookingId && json(q.lines, []).some((l) => l.installmentId))
  if (!open.length) return rows
  const ledger = await ledgerFor(
    ctx.db,
    await ctx
      .db("bookings")
      .whereIn("id", [...new Set(open.map((q) => q.bookingId))])
      .select("id", "status", "netPrice", "agreedPrice"),
  )
  const now = new Date()
  const paidIds = open
    .filter((q) => {
      const lines = ledger.get(q.bookingId)?.lines ?? []
      return json(q.lines, [])
        .filter((l) => l.installmentId)
        .every((l) => (lines.find((x) => x.id === l.installmentId)?.balance ?? 0) <= 0)
    })
    .map((q) => q.id)
  if (paidIds.length) await ctx.db("paymentRequests").whereIn("id", paidIds).where({ status: "issued" }).update({ status: "paid", paidAt: now, updatedAt: now })
  return rows.map((q) => (paidIds.includes(q.id) ? { ...q, status: "paid", paidAt: now } : q))
}

function shapeRequest(q) {
  return {
    code: q.code,
    status: q.status,
    issuedOn: q.issuedOn,
    dueOn: q.dueOn,
    paidAt: q.paidAt ?? null,
    cancelledAt: q.cancelledAt ?? null,
    total: n(q.total),
    lines: json(q.lines, []).map((l) => ({ label: l.label, amount: n(l.amount), kind: l.kind ?? "extra", dueDate: l.dueDate ?? null, installment: Boolean(l.installmentId) })),
    notes: q.notes ?? "",
    booking: q.bookingCode ? { code: q.bookingCode, status: q.bookingStatus } : null,
    unit: q.unitNumber ? { number: q.unitNumber, block: q.blockName ?? null, project: q.projectName } : null,
    buyer: {
      name: q.contactName ?? q.customerName ?? "",
      phone: q.contactPhone ?? q.customerPhone ?? "",
      cnic: q.contactCnic ?? "",
      guardian: q.guardianName ? `${q.guardianRelation ?? "S/O"} ${q.guardianName}` : "",
      address: [q.contactAddress, q.contactCity].filter(Boolean).join(", "),
    },
    account: q.accountId ? { name: q.accountName, bankName: q.bankName ?? "", accountTitle: q.accountTitle ?? "", accountNumber: q.accountNumber ?? "", iban: q.iban ?? "", branch: q.branch ?? "" } : null,
  }
}

export async function paymentRequestList(ctx) {
  const rows = await settlePaid(ctx, await requestQuery(ctx).orderBy("q.issuedOn", "desc").orderBy("q.id", "desc").limit(5000))
  return rows.map(shapeRequest)
}

export async function getPaymentRequest(ctx, code) {
  const row = await requestQuery(ctx)
    .where("q.code", String(code ?? "").toUpperCase())
    .first()
  if (!row) return null
  const [q] = await settlePaid(ctx, [row])
  return shapeRequest(q)
}

// A booking's installments still owed, for a new payment request (oldest first), with the
// requests already open on them
export async function requestableLines(ctx, bookingCode) {
  const b = await live(ctx.db, "bookings")
    .where({ code: String(bookingCode ?? "").toUpperCase() })
    .first("id", "code", "status", "netPrice", "agreedPrice")
  if (!b || ["cancelled", "refunded"].includes(b.status)) return null
  const [money, open] = await Promise.all([ledgerFor(ctx.db, [b]), live(ctx.db, "paymentRequests").where({ bookingId: b.id, status: "issued" }).select("code", "lines")])
  const onRequest = new Map()
  for (const q of open) for (const l of json(q.lines, [])) if (l.installmentId) onRequest.set(l.installmentId, q.code)
  return (money.get(b.id)?.lines ?? [])
    .filter((l) => l.balance > 0)
    .map((l) => ({ id: l.id, label: l.label ?? `Installment ${l.number}`, dueDate: l.dueDate, amount: n(l.amount), balance: l.balance, state: l.state, onRequest: onRequest.get(l.id) ?? null }))
}
