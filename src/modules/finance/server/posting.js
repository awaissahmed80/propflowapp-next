import "server-only"
import { nextCode } from "@/server/db/numbering"
import { peopleByIds } from "@/modules/users/server/queries"
import { ACCOUNTS, FEE_ACCOUNT, voucherTypeFor } from "../constants"

// Double entry for the whole workspace. postVoucher() writes one balanced voucher; the posters
// below turn what happens in the other apps into vouchers, inside the same transaction as the
// change, so the books always match the records:
//   booking made          JV   Dr Receivable from buyers        Cr Sale of plots & units
//   payment received      BRV/CRV  Dr bank or cash (cheque: Cheques in clearing)   Cr Receivable
//   cheque cleared        JV   Dr bank                           Cr Cheques in clearing
//   cheque bounced        JV   Dr Receivable                     Cr Cheques in clearing (or bank)
//   booking canceled      JV   Dr Sale (net price)   Cr Receivable (unpaid) · Refunds payable · Cancellation deductions
//   refund paid           BPV/CPV  Dr Refunds payable            Cr bank or cash
//   commission paid       BPV/CPV  Dr Commission   Cr bank or cash (net) · Income tax withheld
//   service fee received  BRV/CRV  Dr bank or cash               Cr Transfer / NDC & document / Possession fees
// Each poster runs once per event (source_type + source_id + event), so posting again is safe.
//   ctx: { user: { id } } (null user for back-posting)

const round = (n) => Math.round(Number(n) * 100) / 100

// Accounts by code → { code: row }
async function accountsByCode(trx, codes) {
  const rows = await trx("accounts").whereIn("code", codes).whereNull("deletedAt").select("id", "code", "name", "kind", "isHeader", "type")
  return Object.fromEntries(rows.map((r) => [r.code, r]))
}

// The cash or bank account money goes in or out of: the one given, else the workspace's default,
// else Cash in hand
export async function moneyAccount(trx, accountId = null) {
  const base = () => trx("accounts").whereNull("deletedAt").where({ isActive: true }).whereIn("kind", ["cash", "bank"])
  return (
    (accountId && (await base().where({ id: accountId }).first("id", "code", "name", "kind"))) ||
    (await base().where({ isDefault: true }).first("id", "code", "name", "kind")) ||
    (await base().where({ code: ACCOUNTS.cash }).first("id", "code", "name", "kind"))
  )
}

// Books are closed up to and including this day (Finance settings) → Date | null
export async function lockDate(trx) {
  const row = await trx("settings").where({ key: "finance_lock_date" }).first("value")
  let v = row?.value ?? null
  if (typeof v === "string" && v.startsWith('"')) v = JSON.parse(v)
  return v && v !== "null" ? new Date(`${String(v).slice(0, 10)}T23:59:59.999+05:00`) : null
}

export class PostingError extends Error {}

// Write one voucher → { id, code }. Throws PostingError when it doesn't balance or can't post.
//   v: { type: jv|crv|cpv|brv|bpv, date, narration, lines: [{ account: code | accountId, debit, credit, memo }],
//        status: posted|pending, source, sourceType, sourceId, sourceCode, event, projectId, vendorId,
//        party, reference, chequeNo, approvedBy }
export async function postVoucher(trx, ctx, v) {
  const lines = v.lines.map((l) => ({ ...l, debit: round(l.debit ?? 0), credit: round(l.credit ?? 0) })).filter((l) => l.debit || l.credit)
  if (lines.length < 2) throw new PostingError("A voucher needs at least two lines.")
  if (lines.some((l) => l.debit < 0 || l.credit < 0 || (l.debit && l.credit))) throw new PostingError("Each line is either a debit or a credit.")
  const dr = round(lines.reduce((s, l) => s + l.debit, 0))
  const cr = round(lines.reduce((s, l) => s + l.credit, 0))
  if (dr !== cr) throw new PostingError(`Debits (${dr}) and credits (${cr}) don't match.`)
  if (!String(v.narration ?? "").trim()) throw new PostingError("Add a narration.")
  // Resolve accounts given by code
  const codes = lines.filter((l) => typeof l.account === "string").map((l) => l.account)
  const byCode = codes.length ? await accountsByCode(trx, codes) : {}
  const ids = lines.filter((l) => typeof l.account !== "string").map((l) => l.account)
  const byId = ids.length ? Object.fromEntries((await trx("accounts").whereIn("id", ids).whereNull("deletedAt").select("id", "isHeader")).map((r) => [r.id, r])) : {}
  for (const l of lines) {
    const acc = typeof l.account === "string" ? byCode[l.account] : byId[l.account]
    if (!acc) throw new PostingError(`Account ${l.account} isn't in the chart of accounts.`)
    if (acc.isHeader) throw new PostingError("Post to accounts, not to headings.")
    l.accountId = acc.id
  }
  // Closed books: manual entries are refused; automatic ones land on today
  let date = v.date ? new Date(v.date) : new Date()
  const lock = await lockDate(trx)
  if (lock && date <= lock) {
    if ((v.source ?? "manual") === "manual") throw new PostingError(`The books are closed up to ${lock.toISOString().slice(0, 10)}. Pick a later date.`)
    date = new Date()
  }
  const code = await nextCode(trx, `voucher-${v.type}`, {}, date)
  const status = v.status ?? "posted"
  const [id] = await trx("vouchers").insert({
    code,
    type: v.type,
    status,
    voucherDate: date,
    narration: String(v.narration).trim().slice(0, 500),
    amount: dr,
    party: v.party ? String(v.party).slice(0, 150) : null,
    reference: v.reference ? String(v.reference).slice(0, 120) : null,
    chequeNo: v.chequeNo ? String(v.chequeNo).slice(0, 40) : null,
    projectId: v.projectId ?? null,
    vendorId: v.vendorId ?? null,
    source: v.source ?? "manual",
    sourceType: v.sourceType ?? null,
    sourceId: v.sourceId ?? null,
    sourceCode: v.sourceCode ?? null,
    event: v.event ?? null,
    reversalOf: v.reversalOf ?? null,
    approvedBy: status === "posted" ? (v.approvedBy ?? ctx?.user?.id ?? null) : null,
    approvedAt: status === "posted" ? new Date() : null,
    createdBy: ctx?.user?.id ?? null,
  })
  await trx("voucherLines").insert(lines.map((l, i) => ({ voucherId: id, accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ? String(l.memo).slice(0, 255) : null, sortOrder: i })))
  return { id, code }
}

// Void a posted voucher: a reversing JV, the original marked void → { id, code }
export async function reverseVoucher(trx, ctx, voucherId, reason) {
  // Locked, so two people voiding at once can't reverse it twice
  const v = await trx("vouchers").where({ id: voucherId }).whereNull("deletedAt").forUpdate().first()
  if (!v || v.status !== "posted") throw new PostingError("Only posted vouchers can be voided.")
  if (v.reversalOf) throw new PostingError("A reversal can't be voided.")
  const lines = await trx("voucherLines").where({ voucherId }).orderBy("sortOrder")
  const out = await postVoucher(trx, ctx, {
    type: "jv",
    narration: `Reversal of ${v.code}: ${reason}`,
    lines: lines.map((l) => ({ account: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo })),
    source: v.source,
    sourceType: v.sourceType,
    sourceId: v.sourceId,
    sourceCode: v.sourceCode,
    event: "reversal",
    projectId: v.projectId,
    vendorId: v.vendorId,
    party: v.party,
    reference: v.reference,
    chequeNo: v.chequeNo,
    reversalOf: v.id,
  })
  await trx("vouchers")
    .where({ id: voucherId })
    .update({ status: "void", voidedBy: ctx?.user?.id ?? null, voidedAt: new Date(), voidReason: String(reason).slice(0, 300), updatedAt: new Date(), updatedBy: ctx?.user?.id ?? null })
  return out
}

const posted = (trx, sourceType, sourceId, event) => trx("vouchers").where({ sourceType, sourceId, event }).whereNull("deletedAt").whereNot({ status: "void" }).first("id")

// ---------- the other apps' events ----------

// A booking made: the net price becomes receivable and a sale
export async function postBookingSale(trx, ctx, bookingId) {
  if (await posted(trx, "booking", bookingId, "sale")) return null
  const b = await trx("bookings").where({ id: bookingId }).first("id", "code", "netPrice", "agreedPrice", "projectId", "customerName", "bookedAt", "createdAt")
  const net = Number(b?.netPrice ?? b?.agreedPrice ?? 0)
  if (!b || net <= 0) return null
  return postVoucher(trx, ctx, {
    type: "jv",
    date: b.bookedAt ?? b.createdAt,
    narration: `Booking ${b.code}: sale to ${b.customerName}`,
    lines: [
      { account: ACCOUNTS.receivable, debit: net },
      { account: ACCOUNTS.sales, credit: net },
    ],
    source: "booking",
    sourceType: "booking",
    sourceId: b.id,
    sourceCode: b.code,
    event: "sale",
    projectId: b.projectId,
    party: b.customerName,
  })
}

const receiptRow = (trx, id) =>
  trx("receipts as r")
    .join("bookings as b", "b.id", "r.bookingId")
    .where("r.id", id)
    .first("r.id", "r.code", "r.amount", "r.method", "r.accountId", "r.status", "r.receivedOn", "r.clearedAt", "r.bouncedAt", "r.reference", "r.chequeNo", "b.code as bookingCode", "b.projectId", "b.customerName")

// A payment received on a booking. Cheques and pay orders sit in Cheques in clearing until they clear.
//   clearing: whether it waits to clear (default: its status now)
export async function postReceipt(trx, ctx, receiptId, { clearing } = {}) {
  if (await posted(trx, "receipt", receiptId, "received")) return null
  const r = await receiptRow(trx, receiptId)
  if (!r) return null
  const waits = clearing ?? r.status === "clearing"
  const acc = await moneyAccount(trx, r.accountId)
  return postVoucher(trx, ctx, {
    type: waits ? "brv" : voucherTypeFor("in", acc.kind),
    date: r.receivedOn,
    narration: `${r.code}: payment on booking ${r.bookingCode}${waits ? ", cheque in clearing" : ""}`,
    lines: [
      { account: waits ? ACCOUNTS.clearing : acc.id, debit: r.amount },
      { account: ACCOUNTS.receivable, credit: r.amount },
    ],
    source: "receipt",
    sourceType: "receipt",
    sourceId: r.id,
    sourceCode: r.code,
    event: "received",
    projectId: r.projectId,
    party: r.customerName,
    reference: r.reference,
    chequeNo: r.chequeNo,
  })
}

// A cheque in clearing cleared (into its bank) or bounced (owed again)
export async function postReceiptStatus(trx, ctx, receiptId, status) {
  if (!["cleared", "bounced"].includes(status) || (await posted(trx, "receipt", receiptId, status))) return null
  const r = await receiptRow(trx, receiptId)
  if (!r) return null
  const wasCleared = Boolean(await posted(trx, "receipt", receiptId, "cleared"))
  const acc = await moneyAccount(trx, r.accountId)
  const from = status === "bounced" && wasCleared ? acc.id : ACCOUNTS.clearing
  return postVoucher(trx, ctx, {
    type: "jv",
    date: status === "cleared" ? (r.clearedAt ?? new Date()) : (r.bouncedAt ?? new Date()),
    narration: status === "cleared" ? `${r.code}: cheque cleared into ${acc.name}` : `${r.code}: cheque bounced on booking ${r.bookingCode}`,
    lines:
      status === "cleared"
        ? [
            { account: acc.id, debit: r.amount },
            { account: ACCOUNTS.clearing, credit: r.amount },
          ]
        : [
            { account: ACCOUNTS.receivable, debit: r.amount },
            { account: from, credit: r.amount },
          ],
    source: "cheque",
    sourceType: "receipt",
    sourceId: r.id,
    sourceCode: r.code,
    event: status,
    projectId: r.projectId,
    party: r.customerName,
    chequeNo: r.chequeNo,
  })
}

// A booking canceled: the sale comes off; what wasn't paid stops being owed; what was paid is a
// refund owed less the deduction (income). Cheques still in clearing go back off the books.
export async function postCancellation(trx, ctx, bookingId) {
  if (await posted(trx, "booking", bookingId, "cancelled")) return null
  const b = await trx("bookings").where({ id: bookingId }).first("id", "code", "netPrice", "agreedPrice", "projectId", "customerName", "refundAmount", "cancelledAt", "deductionPct")
  if (!b) return null
  const net = Number(b.netPrice ?? b.agreedPrice ?? 0)
  const received = Number((await trx("receipts").where({ bookingId, status: "cleared" }).whereNull("deletedAt").sum({ s: "amount" }).first())?.s ?? 0)
  const refund = Number(b.refundAmount ?? 0)
  const deduction = round(received - refund)
  if (net - received < 0) return null // overpaid bookings need a manual journal
  // Receipts that were in clearing when canceled (posted to clearing, never cleared)
  const dropped = await trx("receipts").where({ bookingId, status: "cancelled" }).whereNull("deletedAt").select("id", "amount")
  let undo = 0
  for (const r of dropped) if ((await posted(trx, "receipt", r.id, "received")) && !(await posted(trx, "receipt", r.id, "cleared"))) undo += Number(r.amount)
  const lines = [
    { account: ACCOUNTS.sales, debit: net, memo: "Sale reversed" },
    { account: ACCOUNTS.receivable, credit: round(net - received), memo: "Unpaid balance" },
    { account: ACCOUNTS.refunds, credit: refund, memo: "Refund owed to the buyer" },
    { account: ACCOUNTS.cancellation, credit: deduction, memo: `${Number(b.deductionPct ?? 0)}% deduction` },
  ]
  if (undo) lines.push({ account: ACCOUNTS.receivable, debit: undo, memo: "Cheques in clearing not banked" }, { account: ACCOUNTS.clearing, credit: undo })
  return postVoucher(trx, ctx, {
    type: "jv",
    date: b.cancelledAt ?? new Date(),
    narration: `Booking ${b.code} canceled: refund ${Math.round(refund).toLocaleString("en-PK")} after ${Number(b.deductionPct ?? 0)}% deduction`,
    lines,
    source: "cancellation",
    sourceType: "booking",
    sourceId: b.id,
    sourceCode: b.code,
    event: "cancelled",
    projectId: b.projectId,
    party: b.customerName,
  })
}

// A refund paid to a canceled booking's buyer → { id, code }
export async function postRefund(trx, ctx, { bookingId, accountId, amount, date, reference, chequeNo }) {
  const b = await trx("bookings").where({ id: bookingId }).first("id", "code", "projectId", "customerName")
  const acc = await moneyAccount(trx, accountId)
  return postVoucher(trx, ctx, {
    type: voucherTypeFor("out", acc.kind),
    date,
    narration: `Refund to ${b.customerName} for canceled booking ${b.code}`,
    lines: [
      { account: ACCOUNTS.refunds, debit: amount },
      { account: acc.id, credit: amount },
    ],
    source: "refund",
    sourceType: "booking",
    sourceId: b.id,
    sourceCode: b.code,
    event: "refund",
    projectId: b.projectId,
    party: b.customerName,
    reference,
    chequeNo,
  })
}

// A commission payout: the gross is an expense; the partner gets the net; the tax withheld is owed to FBR
export async function postCommissionPayout(trx, ctx, payoutId) {
  if (await posted(trx, "commission_payout", payoutId, "paid")) return null
  const p = await trx("commissionPayouts as p")
    .leftJoin("dealers as d", "d.id", "p.dealerId")
    .where("p.id", payoutId)
    .first("p.id", "p.code", "p.partnerType", "p.userId", "p.paidOn", "p.accountId", "p.reference", "p.gross", "p.wht", "p.net", "d.name as dealerName")
  if (!p) return null
  const acc = await moneyAccount(trx, p.accountId)
  const name = p.dealerName ?? (p.userId ? (await peopleByIds([p.userId])).get(p.userId)?.name : null) ?? "the agent"
  return postVoucher(trx, ctx, {
    type: voucherTypeFor("out", acc.kind),
    date: p.paidOn,
    narration: `${p.code}: commission to ${name}`,
    lines: [
      { account: ACCOUNTS.commission, debit: p.gross },
      { account: acc.id, credit: p.net },
      { account: ACCOUNTS.wht, credit: p.wht, memo: "Income tax withheld (section 233)" },
    ],
    source: "commission",
    sourceType: "commission_payout",
    sourceId: p.id,
    sourceCode: p.code,
    event: "paid",
    party: name,
    reference: p.reference,
  })
}

// An Estate Management fee received (transfer, NDC, possession, documents…)
export async function postServiceFee(trx, ctx, requestId) {
  if (await posted(trx, "service_request", requestId, "fee")) return null
  const r = await trx("serviceRequests as r")
    .leftJoin("bookings as b", "b.id", "r.bookingId")
    .leftJoin("contacts as c", "c.id", "r.contactId")
    .where("r.id", requestId)
    .first("r.id", "r.code", "r.type", "r.fee", "b.projectId", "c.name as contactName")
  const fee = typeof r?.fee === "string" ? JSON.parse(r.fee) : r?.fee
  if (!r || !fee?.amount || !fee.paidAt || fee.waived) return null
  const acc = await moneyAccount(trx, fee.accountId ?? null)
  return postVoucher(trx, ctx, {
    type: voucherTypeFor("in", acc.kind),
    date: fee.paidAt,
    narration: `${r.code}: ${r.type.replace("-", " ")} fee`,
    lines: [
      { account: acc.id, debit: fee.amount },
      { account: FEE_ACCOUNT[r.type] ?? ACCOUNTS.otherIncome, credit: fee.amount },
    ],
    source: "fee",
    sourceType: "service_request",
    sourceId: r.id,
    sourceCode: r.code,
    event: "fee",
    projectId: r.projectId,
    party: r.contactName,
    reference: fee.ref,
  })
}
