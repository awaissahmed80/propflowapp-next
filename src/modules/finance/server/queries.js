import "server-only"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { FINANCE_NAV } from "../nav"
import { IN_BOOKS } from "./books"
import { ACCOUNTS, ACCOUNT_TYPES, PERIODS, VOUCHER_SOURCES, VOUCHER_STATUS, VOUCHER_TYPES, periodRange, signedBalance } from "../constants"

// Finance's reads: balances, the chart of accounts, statements, vouchers and the overview.
// Balances count the vouchers in the books (books.js IN_BOOKS: posted, and voided ones, whose
// reversing JV nets them out; pending and sent-back ones never count), and start from each
// account's opening balance, which is in the account's normal direction.
//   ctx: financeContext()

// A page's title and subtitle from the sidebar
export const financeNavItem = (to) => FINANCE_NAV.flatMap((g) => g.items).find((i) => i.to === to) ?? { label: "", description: "" }

const n = (v) => Number(v ?? 0)
const round = (v) => Math.round(Number(v) * 100) / 100
const OWED = ["2100", ACCOUNTS.wht, ACCOUNTS.refunds, ACCOUNTS.eobi]
// A period running to today also takes the rest of today (vouchers are dated noon Pakistan time)
const FIXED_END = ["last-month", "last-fy"]
const periodEnd = (period, to) => (FIXED_END.includes(period) ? to : new Date(to.getTime() + 86_400_000))
const pkMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" })
const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", month: "short" })

// Debits and credits in the books per account → Map(accountId → { dr, cr })
//   before: only vouchers dated before this; upTo: on or before this
async function postedTotals(db, { before, upTo, accountIds } = {}) {
  const rows = await db("voucherLines as l")
    .join("vouchers as v", "v.id", "l.voucherId")
    .whereNull("v.deletedAt")
    .whereIn("v.status", IN_BOOKS)
    .modify((q) => {
      if (before) q.where("v.voucherDate", "<", before)
      if (upTo) q.where("v.voucherDate", "<=", upTo)
      if (accountIds) q.whereIn("l.accountId", accountIds)
    })
    .groupBy("l.accountId")
    .select("l.accountId")
    .sum({ dr: "l.debit", cr: "l.credit" })
  return new Map(rows.map((r) => [r.accountId, { dr: n(r.dr), cr: n(r.cr) }]))
}

const ACCOUNT_COLUMNS = [
  "id",
  "code",
  "name",
  "type",
  "parentCode",
  "isHeader",
  "kind",
  "isSystem",
  "isDefault",
  "isActive",
  "description",
  "bankName",
  "accountTitle",
  "accountNumber",
  "iban",
  "branch",
  "openingBalance",
  "openingDate",
]

const accountShape = (a, t, used) => ({
  ...a,
  openingBalance: n(a.openingBalance),
  balance: round(n(a.openingBalance) + (t ? signedBalance(a.type, t.dr, t.cr) : 0)),
  debits: t?.dr ?? 0,
  credits: t?.cr ?? 0,
  hasPostings: used ? used.has(a.id) : undefined,
})

// Every live account with its balance today, by code
export async function listAccounts(ctx, { activeOnly = false } = {}) {
  const [rows, totals, used] = await Promise.all([
    live(ctx.db, "accounts")
      .modify((q) => activeOnly && q.where({ isActive: true }))
      .orderBy("code")
      .select(ACCOUNT_COLUMNS),
    postedTotals(ctx.db),
    // Any line on a voucher that wasn't deleted (pending and void ones too): those accounts stay
    ctx
      .db("voucherLines as l")
      .join("vouchers as v", "v.id", "l.voucherId")
      .whereNull("v.deletedAt")
      .distinct("l.accountId")
      .then((r) => new Set(r.map((x) => x.accountId))),
  ])
  return rows.map((a) => accountShape(a, totals.get(a.id), used))
}

// The chart as a tree, flattened in display order with depth; headings carry the total of
// everything under them. → { rows: [{ ...account, depth, children }], totals: { asset, … } }
export async function chartOfAccounts(ctx) {
  const accounts = await listAccounts(ctx)
  const byParent = new Map()
  for (const a of accounts) {
    const key = a.parentCode ?? ""
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(a)
  }
  const codes = new Set(accounts.map((a) => a.code))
  const rows = []
  // Depth-first; a heading's balance is its own (usually nothing) plus its children's
  const walk = (a, depth) => {
    const row = { ...a, depth, children: 0 }
    rows.push(row)
    let sum = a.balance
    for (const c of byParent.get(a.code) ?? []) {
      row.children += 1
      sum += walk(c, depth + 1)
    }
    if (a.isHeader) row.balance = round(sum)
    return a.isHeader ? sum : a.balance
  }
  // Top level: no parent, or a parent that no longer exists
  for (const a of accounts) if (!a.parentCode || !codes.has(a.parentCode)) walk(a, 0)
  const totals = {}
  for (const r of rows) if (r.depth === 0) totals[r.type] = round((totals[r.type] ?? 0) + r.balance)
  return { rows, totals }
}

// Cash and bank accounts with balances (default first, then by code), and Cheques in clearing
export async function moneyAccounts(ctx, { includeInactive = false } = {}) {
  const accounts = (await listAccounts(ctx)).filter((a) => (a.kind || a.code === ACCOUNTS.clearing) && (includeInactive || a.isActive))
  const money = accounts.filter((a) => a.kind).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.code.localeCompare(b.code))
  return { accounts: money, clearing: accounts.find((a) => a.code === ACCOUNTS.clearing) ?? null, total: round(money.reduce((s, a) => s + a.balance, 0)) }
}

// ---------- links back to the records vouchers came from ----------

const lower = (c) => encodeURIComponent(String(c ?? "").toLowerCase())

// Receipts' booking codes, for vouchers posted from a receipt → Map(receiptId → bookingCode)
async function receiptBookings(db, vouchers) {
  const ids = [...new Set(vouchers.filter((v) => v.sourceType === "receipt" && v.sourceId).map((v) => v.sourceId))]
  if (!ids.length) return new Map()
  const rows = await db("receipts as r").join("bookings as b", "b.id", "r.bookingId").whereIn("r.id", ids).select("r.id", "b.code as bookingCode")
  return new Map(rows.map((r) => [r.id, r.bookingCode]))
}

// Where a voucher's source lives in the other apps → href | null
function sourceLink(v, receiptBooking) {
  if (!v.sourceType) return null
  if (v.sourceType === "booking") return v.sourceCode ? `/operations/bookings/${lower(v.sourceCode)}` : null
  if (v.sourceType === "receipt") {
    const b = receiptBooking.get(v.sourceId)
    return b ? `/operations/bookings/${lower(b)}` : null
  }
  if (v.sourceType === "service_request") return v.sourceCode ? `/estate-management/requests/${lower(v.sourceCode)}` : null
  if (v.sourceType === "commission_payout") return "/operations/commissions?tab=payouts"
  return null
}

const projectRef = (p) => (p?.id ? { code: p.code, name: p.name } : null)

function voucherShape(v, receiptBooking) {
  return {
    code: v.code,
    type: v.type,
    status: v.status,
    date: v.voucherDate,
    narration: v.narration,
    amount: n(v.amount),
    party: v.party,
    reference: v.reference,
    chequeNo: v.chequeNo,
    source: v.source,
    sourceType: v.sourceType,
    sourceCode: v.sourceCode,
    event: v.event,
    project: projectRef({ id: v.projectId, code: v.projectCode, name: v.projectName }),
    link: sourceLink(v, receiptBooking),
    isReversal: Boolean(v.reversalOf),
  }
}

const voucherBase = (db) =>
  db("vouchers as v")
    .leftJoin("projects as p", "p.id", "v.projectId")
    .whereNull("v.deletedAt")
    .select(
      "v.id",
      "v.code",
      "v.type",
      "v.status",
      "v.voucherDate",
      "v.narration",
      "v.amount",
      "v.party",
      "v.reference",
      "v.chequeNo",
      "v.projectId",
      "v.source",
      "v.sourceType",
      "v.sourceId",
      "v.sourceCode",
      "v.event",
      "v.reversalOf",
      "p.code as projectCode",
      "p.name as projectName",
    )

// "bpv,cpv" or ["bpv", "cpv"] → ["bpv", "cpv"]
const many = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim().toLowerCase()).filter(Boolean)

// The voucher list. filters: { period (PERIODS value), type, source, status, project (a project
// code, or "head-office"; each one value, a list or comma-separated), q (voucher no., narration, party, reference or cheque no.) } → { vouchers, range, truncated }
export const VOUCHER_LIMIT = 2000
export async function listVouchers(ctx, filters = {}) {
  const period = PERIODS.some((p) => p.value === filters.period) ? filters.period : "this-fy"
  const { from, to } = periodRange(period)
  const q = String(filters.q ?? "").trim()
  const rows = await voucherBase(ctx.db)
    .modify((x) => {
      if (from) x.where("v.voucherDate", ">=", from)
      x.where("v.voucherDate", "<=", periodEnd(period, to))
      const types = many(filters.type).filter((t) => VOUCHER_TYPES[t])
      const sources = many(filters.source).filter((t) => VOUCHER_SOURCES[t])
      const statuses = many(filters.status).filter((t) => VOUCHER_STATUS[t])
      const projects = many(filters.project)
      if (types.length) x.whereIn("v.type", types)
      if (sources.length) x.whereIn("v.source", sources)
      if (statuses.length) x.whereIn("v.status", statuses)
      if (projects.length)
        x.where((w) => {
          if (projects.includes("head-office")) w.orWhereNull("v.projectId")
          const codes = projects.filter((c) => c !== "head-office").map((c) => c.toUpperCase())
          if (codes.length) w.orWhereIn("p.code", codes)
        })
      if (q) {
        const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        x.where((w) => w.where("v.code", "like", like).orWhere("v.narration", "like", like).orWhere("v.party", "like", like).orWhere("v.reference", "like", like).orWhere("v.chequeNo", "like", like))
      }
    })
    .orderBy("v.voucherDate", "desc")
    .orderBy("v.id", "desc")
    .limit(VOUCHER_LIMIT + 1)
  const receiptBooking = await receiptBookings(ctx.db, rows)
  return { vouchers: rows.slice(0, VOUCHER_LIMIT).map((v) => voucherShape(v, receiptBooking)), period, truncated: rows.length > VOUCHER_LIMIT }
}

// One voucher with its lines, people and links → null when there's no such voucher
//   code: any case (from the URL)
export async function getVoucher(ctx, code) {
  const v = await voucherBase(ctx.db)
    .leftJoin("vendors as vd", "vd.id", "v.vendorId")
    .where("v.code", String(code ?? "").toUpperCase())
    .first("v.createdBy", "v.createdAt", "v.approvedBy", "v.approvedAt", "v.voidedBy", "v.voidedAt", "v.voidReason", "vd.code as vendorCode", "vd.name as vendorName")
  if (!v) return null
  const [lines, receiptBooking, reversalOf, reversedBy] = await Promise.all([
    ctx.db("voucherLines as l").leftJoin("accounts as a", "a.id", "l.accountId").where("l.voucherId", v.id).orderBy("l.sortOrder").select("l.id", "l.debit", "l.credit", "l.memo", "a.code", "a.name", "a.kind"),
    receiptBookings(ctx.db, [v]),
    v.reversalOf ? ctx.db("vouchers").where({ id: v.reversalOf }).first("code") : null,
    ctx.db("vouchers").where({ reversalOf: v.id }).whereNull("deletedAt").first("code"),
  ])
  const people = await peopleByIds([v.createdBy, v.approvedBy, v.voidedBy])
  const person = (id) => (id ? (people.get(id)?.name ?? "Someone") : null)
  return {
    ...voucherShape(v, receiptBooking),
    vendor: v.vendorCode ? { code: v.vendorCode, name: v.vendorName } : null,
    lines: lines.map((l) => ({ id: l.id, account: l.code, accountName: l.name ?? "Removed account", kind: l.kind, debit: n(l.debit), credit: n(l.credit), memo: l.memo })),
    createdBy: person(v.createdBy),
    createdAt: v.createdAt,
    approvedBy: person(v.approvedBy),
    approvedAt: v.approvedAt,
    voidedBy: person(v.voidedBy),
    voidedAt: v.voidedAt,
    voidReason: v.voidReason,
    reversalOf: reversalOf?.code ?? null,
    reversedBy: reversedBy?.code ?? null,
  }
}

// ---------- statements ----------

// One account's ledger for a period: opening balance, each posted line with a running balance,
// closing balance. → null for no such account (or a heading)
//   code: the account code · period: a PERIODS value (default this financial year)
export async function accountStatement(ctx, code, period = "this-fy") {
  const account = await live(ctx.db, "accounts")
    .where({ code: String(code ?? "") })
    .first(ACCOUNT_COLUMNS)
  if (!account || account.isHeader) return null
  const p = PERIODS.some((x) => x.value === period) ? period : "this-fy"
  const { from, to } = periodRange(p)
  const end = periodEnd(p, to)
  const [before, rows] = await Promise.all([
    from ? postedTotals(ctx.db, { before: from, accountIds: [account.id] }) : new Map(),
    ctx
      .db("voucherLines as l")
      .join("vouchers as v", "v.id", "l.voucherId")
      .leftJoin("projects as p", "p.id", "v.projectId")
      .whereNull("v.deletedAt")
      .whereIn("v.status", IN_BOOKS)
      .where("l.accountId", account.id)
      .modify((q) => {
        if (from) q.where("v.voucherDate", ">=", from)
        q.where("v.voucherDate", "<=", end)
      })
      .orderBy("v.voucherDate")
      .orderBy("v.id")
      .orderBy("l.sortOrder")
      .select(
        "l.id as lineId",
        "l.debit",
        "l.credit",
        "l.memo",
        "v.id",
        "v.code",
        "v.type",
        "v.status",
        "v.voucherDate",
        "v.narration",
        "v.amount",
        "v.party",
        "v.reference",
        "v.chequeNo",
        "v.projectId",
        "v.source",
        "v.sourceType",
        "v.sourceId",
        "v.sourceCode",
        "v.event",
        "v.reversalOf",
        "p.code as projectCode",
        "p.name as projectName",
      ),
  ])
  const t = before.get(account.id)
  // The opening balance starts on its opening date: before the period, it's in the opening;
  // inside the period, it's a line of its own
  const ob = n(account.openingBalance)
  const startsInside = Boolean(ob && from && account.openingDate && new Date(account.openingDate) >= from)
  const opening = round((startsInside ? 0 : ob) + (t ? signedBalance(account.type, t.dr, t.cr) : 0))
  const receiptBooking = await receiptBookings(ctx.db, rows)
  const entries = rows.map((r) => ({ ...voucherShape(r, receiptBooking), id: r.lineId, debit: n(r.debit), credit: n(r.credit), memo: r.memo }))
  if (startsInside && new Date(account.openingDate) <= end) {
    const debitSide = ACCOUNT_TYPES[account.type]?.normal !== "credit" ? ob >= 0 : ob < 0
    const at = entries.findIndex((e) => new Date(e.date) > new Date(account.openingDate))
    const line = {
      id: "opening",
      code: null,
      type: null,
      status: "posted",
      date: account.openingDate,
      narration: "Opening balance",
      debit: debitSide ? Math.abs(ob) : 0,
      credit: debitSide ? 0 : Math.abs(ob),
      opening: true,
    }
    entries.splice(at < 0 ? entries.length : at, 0, line)
  }
  let balance = opening
  const lines = entries.map((e) => {
    balance = round(balance + signedBalance(account.type, e.debit, e.credit))
    return { ...e, balance }
  })
  const debits = round(lines.reduce((s, l) => s + l.debit, 0))
  const credits = round(lines.reduce((s, l) => s + l.credit, 0))
  return { account: { ...account, openingBalance: n(account.openingBalance) }, period: p, from, to, opening, debits, credits, closing: balance, lines }
}

// ---------- the overview ----------

// Cash and bank, what's in clearing, what buyers owe and what's owed, money in and out over the
// last six months (cash basis: lines on cash and bank accounts, leaving out transfers between
// them), the latest vouchers and what's waiting for approval.
export async function financeOverview(ctx) {
  const now = new Date()
  const [y, m] = pkMonth.format(now).split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1 - 5, 1) - 5 * 3_600_000) // 1st of the month, 5 months back, Pakistan midnight
  const [accounts, recent, pending, flows] = await Promise.all([
    listAccounts(ctx),
    voucherBase(ctx.db).orderBy("v.voucherDate", "desc").orderBy("v.id", "desc").limit(8),
    ctx.db("vouchers").whereNull("deletedAt").where({ status: "pending" }).count({ c: "id" }).sum({ s: "amount" }).first(),
    ctx
      .db("voucherLines as l")
      .join("vouchers as v", "v.id", "l.voucherId")
      .join("accounts as a", "a.id", "l.accountId")
      .whereNull("v.deletedAt")
      .whereIn("v.status", IN_BOOKS)
      .where("v.voucherDate", ">=", first)
      .select("v.id", "v.voucherDate", "l.debit", "l.credit", "a.kind"),
  ])
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const bal = (code) => byCode.get(code)?.balance ?? 0
  const money = accounts.filter((a) => a.kind && a.isActive).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.code.localeCompare(b.code))

  // Months, oldest first
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15))
    months.push({ key: pkMonth.format(d), month: monthLabel.format(d), in: 0, out: 0 })
  }
  const byMonth = new Map(months.map((x) => [x.key, x]))
  // Per voucher: a transfer only touches cash and bank accounts
  const vouchers = new Map()
  for (const l of flows) {
    if (!vouchers.has(l.id)) vouchers.set(l.id, { date: l.voucherDate, lines: [] })
    vouchers.get(l.id).lines.push(l)
  }
  for (const v of vouchers.values()) {
    if (v.lines.every((l) => l.kind)) continue
    const bucket = byMonth.get(pkMonth.format(new Date(v.date)))
    if (!bucket) continue
    for (const l of v.lines)
      if (l.kind) {
        bucket.in += n(l.debit)
        bucket.out += n(l.credit)
      }
  }
  for (const x of months) {
    x.in = round(x.in)
    x.out = round(x.out)
  }
  const receiptBooking = await receiptBookings(ctx.db, recent)
  return {
    cash: round(money.reduce((s, a) => s + a.balance, 0)),
    clearing: bal(ACCOUNTS.clearing),
    receivable: bal(ACCOUNTS.receivable),
    owed: round(OWED.reduce((s, c) => s + bal(c), 0)),
    payable: bal("2100"),
    taxWithheld: bal(ACCOUNTS.wht),
    refunds: bal(ACCOUNTS.refunds),
    eobi: bal(ACCOUNTS.eobi),
    months,
    cashAccounts: money.map((a) => ({ code: a.code, name: a.name, kind: a.kind, balance: a.balance, isDefault: a.isDefault })),
    recent: recent.map((v) => voucherShape(v, receiptBooking)),
    pending: { count: Number(pending?.c ?? 0), amount: n(pending?.s) },
  }
}

// ---------- what the voucher forms pick from ----------

// → { accounts: [{ id, code, name, type, kind }] (posting accounts, active), vendors, projects, defaultMoneyId }
export async function voucherFormData(ctx) {
  const [accounts, vendors, projects] = await Promise.all([
    live(ctx.db, "accounts").where({ isHeader: false, isActive: true }).orderBy("code").select("id", "code", "name", "type", "kind", "isDefault", "description"),
    live(ctx.db, "vendors").where({ isActive: true }).orderBy("name").select("id", "code", "name", "category", "accountId", "whtPct"),
    live(ctx.db, "projects").orderBy("name").select("id", "code", "name"),
  ])
  const money = accounts.filter((a) => a.kind)
  const defaultMoney = money.find((a) => a.isDefault) ?? money.find((a) => a.code === ACCOUNTS.cash) ?? money[0]
  return {
    accounts: accounts.map(({ isDefault, ...a }) => a),
    vendors: vendors.map((v) => ({ ...v, whtPct: n(v.whtPct) })),
    projects,
    defaultMoneyId: defaultMoney?.id ?? null,
  }
}
