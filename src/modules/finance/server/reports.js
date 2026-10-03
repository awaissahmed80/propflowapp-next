import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { vizColor } from "@/lib/chart-colors"
import { ledgerFor } from "@/modules/operations/server/ledger"
import { ACCOUNTS, PERIODS, VOUCHER_SOURCES, VOUCHER_STATUS, VOUCHER_TYPES, financialYearOf, periodRange, signedBalance } from "../constants"
import { IN_BOOKS, balancesAsOf, bookLines, chartOfAccounts, forProject, openedBy, openingNet, totalsByAccount } from "./books"

// Finance's ready-made reports, in the shape lib/reports.js describes (same table, chart, print,
// PDF and Excel as the other apps). Built from the books (books.js): posted vouchers plus voided
// originals, which their posted reversals cancel out (see IN_BOOKS there).
// load(ctx, values, env): values are the URL's filter values (lowercased); env the resolved ones:
//   { range: { from, to }, asOf, project: null | "head-office" | id, projects, accounts }
// Filters: period ("" = this financial year), asOf ("" = today), project ("" = whole business,
// "head-office" = vouchers without a project), account and cash (account codes), split, status.

const DAY = 86_400_000
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const round = (n) => Math.round(Number(n) * 100) / 100
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)
// "2026-10-03" in Pakistan time (sorts and reads well in tables and Excel)
const isoDay = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d)) : null)
// "30 Sep 2026"
const longDay = (d) => {
  const [y, m, day] = isoDay(d).split("-")
  return `${Number(day)} ${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)))} ${y}`
}
const monthKey = (d) => isoDay(d).slice(0, 7)
const monthLabel = (key) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))
// Days run midnight to midnight in Pakistan, whatever the server's time zone
const pkStart = (day) => new Date(`${day}T00:00:00.000+05:00`)
const pkEnd = (day) => new Date(`${day}T23:59:59.999+05:00`)
// The calendar day a server-local Date stands for (periodRange and financialYearOf build those)
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
// The financial year a Pakistan day falls in → { start (PK midnight), label }
const fyOf = (day) => {
  const fy = financialYearOf(new Date(`${day}T12:00:00`))
  return { start: pkStart(localDay(fy.start)), label: fy.label }
}
const accountLabel = (a) => `${a.code} ${a.name}`
const isCostOfSales = (a) => a.type === "expense" && String(a.code).startsWith("5")

// Month keys from one date to another, oldest first (at most `limit`, the latest ones)
function monthsBetween(from, to, limit = 24) {
  const out = []
  const d = new Date(`${monthKey(from)}-01T00:00:00Z`)
  const last = monthKey(to)
  while (out.length < 240) {
    const key = d.toISOString().slice(0, 7)
    out.push(key)
    if (key >= last) break
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out.slice(-limit)
}

// When the books start (the earliest voucher or opening balance), for "All time" charts
async function booksStart(db) {
  const [v, a] = await Promise.all([
    db("vouchers").whereNull("deletedAt").whereIn("status", IN_BOOKS).min({ d: "voucherDate" }).first(),
    live(db, "accounts").whereNot("openingBalance", 0).min({ d: "openingDate" }).first(),
  ])
  const dates = [v?.d, a?.d].filter(Boolean).map((d) => new Date(d))
  return dates.length ? new Date(Math.min(...dates)) : new Date()
}

// The "as of" choices: today and recent period ends (Pakistan days)
function asOfChoices(now = new Date()) {
  const [y, m] = isoDay(now).split("-").map(Number)
  const lastMonth = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  const dayBefore = (d) => isoDay(new Date(d.getTime() - 1))
  const lastFy = dayBefore(fyOf(isoDay(now)).start)
  const fyBefore = dayBefore(fyOf(lastFy).start)
  return [
    { value: "last-month", label: `End of last month (${longDay(pkEnd(lastMonth))})`, date: pkEnd(lastMonth) },
    { value: "last-fy", label: `End of ${fyOf(lastFy).label} (${longDay(pkEnd(lastFy))})`, date: pkEnd(lastFy) },
    { value: "fy-before", label: `End of ${fyOf(fyBefore).label} (${longDay(pkEnd(fyBefore))})`, date: pkEnd(fyBefore) },
  ]
}

const sourceLabel = (s) => VOUCHER_SOURCES[s]?.label ?? s ?? "—"
const typeLabel = (t) => VOUCHER_TYPES[t]?.short ?? String(t ?? "").toUpperCase()
const noBuyersNote = "Buyers' bookings always belong to a project, so Head office has none."

export const REPORT_GROUPS = ["Books", "Buyers", "Tax & vendors"]

export const REPORTS = [
  // ---------------------------------------------------------------- Books
  {
    id: "trial-balance",
    group: "Books",
    title: "Trial balance",
    description: "Every account's debit or credit balance on a date. The two totals must match.",
    icon: "scales-3-line",
    filters: ["asOf", "project"],
    async load(ctx, values, env) {
      const balances = (await balancesAsOf(ctx.db, { asOf: env.asOf, project: env.project })).filter((a) => Math.abs(a.net) >= 0.01)
      const rows = balances.map((a) => ({ id: a.code, code: a.code, account: a.name, type: a.type[0].toUpperCase() + a.type.slice(1), debit: a.net > 0 ? a.net : null, credit: a.net < 0 ? -a.net : null }))
      // Opening balances have no other side; show the difference so the totals agree
      const gap = round(sum(rows, (r) => r.debit) - sum(rows, (r) => r.credit))
      if (Math.abs(gap) >= 0.01 && !env.project) rows.push({ id: "opening", code: "", account: "Opening balances (owners' equity)", type: "Equity", debit: gap < 0 ? -gap : null, credit: gap > 0 ? gap : null })
      const debit = round(sum(rows, (r) => r.debit))
      const credit = round(sum(rows, (r) => r.credit))
      if (rows.length) rows.push({ id: "total", code: "", account: "Total", type: "", debit, credit })
      return {
        columns: [
          { key: "code", header: "Code", width: 8 },
          { key: "account", header: "Account", width: 34 },
          { key: "type", header: "Type", width: 10 },
          { key: "debit", header: "Debit", type: "pkr", width: 16 },
          { key: "credit", header: "Credit", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Total debits", value: rs(debit) },
          { label: "Total credits", value: rs(credit) },
          { label: "Difference", value: Math.abs(debit - credit) < 0.01 ? "None: balanced" : rs(debit - credit) },
          { label: "Accounts with a balance", value: number(balances.length) },
        ],
        note: rows.length
          ? env.project
            ? "For one project the totals agree because every voucher balances; opening balances belong to the whole business and are left out."
            : null
          : "Nothing in the books on this date.",
      }
    },
  },
  {
    id: "profit-loss",
    group: "Books",
    title: "Profit & loss",
    description: "Income, cost of sales, gross profit, expenses and net profit for a period, overall or by project.",
    icon: "line-chart-line",
    filters: ["period", "project", "split"],
    async load(ctx, values, env) {
      const accounts = env.accounts.filter((a) => !a.isHeader && ["income", "expense"].includes(a.type))
      const lines = await bookLines(ctx.db, { ...env.range, project: env.project })
        .whereIn(
          "l.accountId",
          accounts.map((a) => a.id),
        )
        .select("l.accountId", "l.debit", "l.credit", "v.voucherDate", "v.projectId")
      const byId = new Map(accounts.map((a) => [a.id, a]))
      // Income reads positive as a credit, costs as a debit
      const value = (l) => {
        const a = byId.get(l.accountId)
        return a.type === "income" ? Number(l.credit) - Number(l.debit) : Number(l.debit) - Number(l.credit)
      }
      const split = values.split === "project"
      const cols = split
        ? [...new Set(lines.map((l) => l.projectId ?? 0))]
            .map((id) => ({ id, key: id ? `p${id}` : "ho", name: id ? (env.projects.find((p) => p.id === id)?.name ?? "Project") : "Head office" }))
            .sort((a, b) => (a.id === 0) - (b.id === 0) || a.name.localeCompare(b.name))
        : []
      const amounts = (list) => {
        const out = { amount: round(sum(list, value)) }
        for (const c of cols)
          out[c.key] = round(
            sum(
              list.filter((l) => (l.projectId ?? 0) === c.id),
              value,
            ),
          )
        return out
      }
      const keys = ["amount", ...cols.map((c) => c.key)]
      const combine = (a, b, sign = -1) => Object.fromEntries(keys.map((k) => [k, round((a[k] ?? 0) + sign * (b[k] ?? 0))]))
      const section = (title, id, list) => {
        const rows = list.map((a) => ({ id: a.code, account: accountLabel(a), ...amounts(lines.filter((l) => l.accountId === a.id)) })).filter((r) => keys.some((k) => Math.abs(r[k]) >= 0.01))
        const total = amounts(lines.filter((l) => list.some((a) => a.id === l.accountId)))
        return { rows: [{ id: `${id}-heading`, account: title }, ...rows, { id: `${id}-total`, account: `Total ${title.toLowerCase()}`, ...total }], total }
      }
      const income = section(
        "Income",
        "income",
        accounts.filter((a) => a.type === "income"),
      )
      const cos = section("Cost of sales", "cos", accounts.filter(isCostOfSales))
      const expenses = section(
        "Expenses",
        "expenses",
        accounts.filter((a) => a.type === "expense" && !isCostOfSales(a)),
      )
      const gross = combine(income.total, cos.total)
      const net = combine(gross, expenses.total)
      const rows = [...income.rows, ...cos.rows, { id: "gross", account: "Gross profit", ...gross }, ...expenses.rows, { id: "net", account: "Net profit", ...net }]
      if (!split) for (const r of rows) r.share = r.amount == null || !income.total.amount ? null : pct(r.amount, income.total.amount)

      // Income vs costs by month
      const from = env.range.from ?? (await booksStart(ctx.db))
      const months = monthsBetween(from, env.range.to)
      const data = months.map((m) => {
        const own = lines.filter((l) => monthKey(l.voucherDate) === m)
        return {
          month: monthLabel(m),
          income: round(
            sum(
              own.filter((l) => byId.get(l.accountId).type === "income"),
              value,
            ),
          ),
          costs: round(
            sum(
              own.filter((l) => byId.get(l.accountId).type === "expense"),
              value,
            ),
          ),
        }
      })
      return {
        columns: [
          { key: "account", header: "Account", width: 34 },
          ...cols.map((c) => ({ key: c.key, header: c.name, type: "pkr", width: 14 })),
          { key: "amount", header: split ? "Total" : "Amount", type: "pkr", width: 16 },
          ...(split ? [] : [{ key: "share", header: "% of income", type: "pct", width: 10 }]),
        ],
        rows,
        summary: [
          { label: "Income", value: rs(income.total.amount) },
          { label: "Gross profit", value: rs(gross.amount) },
          { label: "Expenses", value: rs(expenses.total.amount) },
          { label: net.amount < 0 ? "Net loss" : "Net profit", value: rs(net.amount) },
        ],
        chart: lines.length
          ? {
              kind: "bars",
              title: "Income and costs by month",
              categoryKey: "month",
              money: true,
              series: [
                { key: "income", label: "Income", color: vizColor("blue") },
                { key: "costs", label: "Cost of sales & expenses", color: vizColor("amber") },
              ],
              data,
            }
          : null,
        note: lines.length ? null : "Nothing posted to income or expense accounts in this period.",
      }
    },
  },
  {
    id: "balance-sheet",
    group: "Books",
    title: "Balance sheet",
    description: "What the business owns and owes on a date, and the owners' equity including profit to date.",
    icon: "survey-line",
    filters: ["asOf"],
    async load(ctx, values, env) {
      const asOf = env.asOf
      const fy = fyOf(isoDay(asOf))
      const fyStart = fy.start
      const [balances, beforeFy] = await Promise.all([balancesAsOf(ctx.db, { asOf }), totalsByAccount(ctx.db, { before: fyStart })])
      const of = (type) => balances.filter((a) => a.type === type)
      // In the account's normal direction
      const shown = (a) => (a.type === "asset" ? a.net : -a.net)
      const lines = (list) => list.filter((a) => Math.abs(a.net) >= 0.01).map((a) => ({ id: a.code, account: accountLabel(a), amount: shown(a) }))
      const assets = round(sum(of("asset"), shown))
      const liabilities = round(sum(of("liability"), shown))
      const equityAccounts = round(sum(of("equity"), shown))
      // Profit to date: income less expenses (not closed to retained earnings), this year and before
      const pl = balances.filter((a) => ["income", "expense"].includes(a.type))
      const profitToDate = round(-sum(pl, (a) => a.net))
      const earlier = round(-sum(pl, (a) => (beforeFy.get(a.id)?.debit ?? 0) - (beforeFy.get(a.id)?.credit ?? 0)))
      const thisYear = round(profitToDate - earlier)
      // Opening balances' other side (owners' equity), so the sheet balances
      const opening = round(sum(balances, (a) => (openedBy(a, asOf) ? openingNet(a) : 0)))
      const equity = round(equityAccounts + opening + profitToDate)
      const difference = round(assets - liabilities - equity)
      const rows = [
        { id: "assets-heading", account: "Assets" },
        ...lines(of("asset")),
        { id: "assets-total", account: "Total assets", amount: assets },
        { id: "liabilities-heading", account: "Liabilities" },
        ...lines(of("liability")),
        { id: "liabilities-total", account: "Total liabilities", amount: liabilities },
        { id: "equity-heading", account: "Equity" },
        ...lines(of("equity")),
        ...(Math.abs(opening) >= 0.01 ? [{ id: "opening", account: "Opening balances (owners' equity)", amount: opening }] : []),
        ...(Math.abs(earlier) >= 0.01 ? [{ id: "earlier", account: "Profit of earlier years", amount: earlier }] : []),
        { id: "this-year", account: `Profit for ${fy.label} to date`, amount: thisYear },
        { id: "equity-total", account: "Total equity", amount: equity },
        { id: "le-total", account: "Total liabilities & equity", amount: round(liabilities + equity) },
        { id: "check", account: Math.abs(difference) < 0.01 ? "Check: assets equal liabilities & equity" : "Check: difference (should be nil)", amount: difference },
      ]
      return {
        columns: [
          { key: "account", header: "Account", width: 40 },
          { key: "amount", header: "Amount", type: "pkr", width: 18 },
        ],
        rows,
        summary: [
          { label: "Total assets", value: rs(assets) },
          { label: "Total liabilities", value: rs(liabilities) },
          { label: "Equity", value: rs(equity) },
          { label: "Check", value: Math.abs(difference) < 0.01 ? "Balanced" : `Off by ${rs(difference)}` },
        ],
        note: "Profit isn't closed into retained earnings yet, so profit to date is shown under equity.",
      }
    },
  },
  {
    id: "general-ledger",
    group: "Books",
    title: "General ledger",
    description: "Every entry to an account in a period with its running balance, or every account's activity at a glance.",
    icon: "book-2-line",
    filters: ["account", "period", "project"],
    async load(ctx, values, env) {
      const { from, to } = env.range
      const withOpening = !env.project
      const account = values.account ? env.accounts.find((a) => !a.isHeader && a.code.toLowerCase() === values.account) : null

      if (!account) {
        // Account activity: opening, debits, credits and closing for each account
        const [before, during] = await Promise.all([from ? totalsByAccount(ctx.db, { before: from, project: env.project }) : new Map(), totalsByAccount(ctx.db, { from, to, project: env.project })])
        const rows = env.accounts
          .filter((a) => !a.isHeader)
          .map((a) => {
            const b = before.get(a.id) ?? { debit: 0, credit: 0 }
            const d = during.get(a.id) ?? { debit: 0, credit: 0 }
            const openNet = (withOpening && (from ? openedBy(a, new Date(from.getTime() - 1)) : openedBy(a, to)) ? openingNet(a) : 0) + b.debit - b.credit
            // Opening balances entered during the period count as activity
            const enteredNet = withOpening && from && a.opening && a.openingDate && new Date(a.openingDate) >= from && new Date(a.openingDate) <= to ? openingNet(a) : 0
            const debit = round(d.debit + Math.max(0, enteredNet))
            const credit = round(d.credit + Math.max(0, -enteredNet))
            const opening = round(signedBalance(a.type, Math.max(0, openNet), Math.max(0, -openNet)))
            const closing = round(opening + signedBalance(a.type, debit, credit))
            return { id: a.code, code: a.code, account: a.name, opening, debit: debit || null, credit: credit || null, closing }
          })
          .filter((r) => r.opening || r.debit || r.credit || r.closing)
        return {
          columns: [
            { key: "code", header: "Code", width: 8 },
            { key: "account", header: "Account", width: 30 },
            { key: "opening", header: "Opening", type: "pkr", width: 16 },
            { key: "debit", header: "Debits", type: "pkr", width: 16 },
            { key: "credit", header: "Credits", type: "pkr", width: 16 },
            { key: "closing", header: "Closing", type: "pkr", width: 16 },
          ],
          rows,
          summary: [
            { label: "Accounts with activity", value: number(rows.length) },
            { label: "Debits in period", value: rs(sum(rows, (r) => r.debit)) },
            { label: "Credits in period", value: rs(sum(rows, (r) => r.credit)) },
          ],
          note: rows.length
            ? "Balances read in each account's normal direction (assets and expenses as debits; liabilities, equity and income as credits). Pick an account to see its entries."
            : "No activity in this period.",
        }
      }

      const before = from ? ((await totalsByAccount(ctx.db, { before: from, project: env.project })).get(account.id) ?? { debit: 0, credit: 0 }) : { debit: 0, credit: 0 }
      const openingCounts = withOpening && (from ? Boolean(account.opening) && (!account.openingDate || new Date(account.openingDate) < from) : openedBy(account, to))
      const openingEntered = withOpening && Boolean(account.opening) && from && account.openingDate && new Date(account.openingDate) >= from && new Date(account.openingDate) <= to
      const openNet = (openingCounts ? openingNet(account) : 0) + before.debit - before.credit
      let balance = round(signedBalance(account.type, Math.max(0, openNet), Math.max(0, -openNet)))
      const entries = await bookLines(ctx.db, { from, to, project: env.project })
        .where("l.accountId", account.id)
        .orderBy("v.voucherDate")
        .orderBy("v.id")
        .orderBy("l.sortOrder")
        .select("l.id", "l.debit", "l.credit", "l.memo", "v.code", "v.type", "v.voucherDate", "v.narration", "v.party", "v.status")
      const list = entries.map((e) => ({ ...e, debit: Number(e.debit), credit: Number(e.credit) }))
      if (openingEntered) {
        const n = openingNet(account)
        list.push({ id: "entered", debit: Math.max(0, n), credit: Math.max(0, -n), code: "", type: null, voucherDate: account.openingDate, narration: "Opening balance entered", party: null, status: "posted" })
        list.sort((a, b) => new Date(a.voucherDate) - new Date(b.voucherDate))
      }
      const rows = [{ id: "opening", date: from ? isoDay(from) : "", voucher: "", narration: "Opening balance", balance }]
      for (const e of list) {
        balance = round(balance + signedBalance(account.type, e.debit, e.credit))
        rows.push({
          id: String(e.id),
          date: isoDay(e.voucherDate),
          voucher: e.code,
          type: e.type ? typeLabel(e.type) : "",
          narration: [e.narration, e.memo].filter(Boolean).join(" · ") + (e.status === "void" ? " (voided)" : ""),
          party: e.party,
          debit: e.debit || null,
          credit: e.credit || null,
          balance,
        })
      }
      rows.push({ id: "closing", date: isoDay(to), voucher: "", narration: "Closing balance", balance })
      return {
        columns: [
          { key: "date", header: "Date", width: 11 },
          { key: "voucher", header: "Voucher", width: 16 },
          { key: "type", header: "Type", width: 6 },
          { key: "narration", header: "Narration", width: 40 },
          { key: "party", header: "Party", width: 18 },
          { key: "debit", header: "Debit", type: "pkr", width: 14 },
          { key: "credit", header: "Credit", type: "pkr", width: 14 },
          { key: "balance", header: "Balance", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Opening", value: rs(rows[0].balance) },
          { label: "Debits", value: rs(sum(list, (e) => e.debit)) },
          { label: "Credits", value: rs(sum(list, (e) => e.credit)) },
          { label: "Closing", value: rs(balance) },
        ],
        note: `${accountLabel(account)}: balance in its normal direction (${signedBalance(account.type, 1, 0) > 0 ? "debit" : "credit"}).${list.some((e) => e.status === "void") ? " Voided vouchers stay in the period they were made; their reversals take them out on the day they were voided." : ""}`,
      }
    },
  },
  {
    id: "cash-book",
    group: "Books",
    title: "Cash book",
    description: "Money in and out of cash and bank accounts in a period, with opening and closing balances.",
    icon: "wallet-3-line",
    filters: ["period", "cash"],
    async load(ctx, values, env) {
      const { from, to } = env.range
      const all = env.accounts.filter((a) => !a.isHeader && ["cash", "bank"].includes(a.kind))
      const picked = values.cash ? all.filter((a) => a.code.toLowerCase() === values.cash) : all
      const ids = picked.map((a) => a.id)
      const byId = new Map(picked.map((a) => [a.id, a]))
      const start = from ?? (await booksStart(ctx.db))
      // Balance before the period (opening balances entered before it included)
      const before = from ? await totalsByAccount(ctx.db, { before: from }) : new Map()
      const openingOf = (a) => ((from ? a.opening && (!a.openingDate || new Date(a.openingDate) < from) : openedBy(a, to)) ? a.opening : 0) + (before.get(a.id)?.debit ?? 0) - (before.get(a.id)?.credit ?? 0)
      const opening = round(sum(picked, openingOf))
      const entries = ids.length
        ? await bookLines(ctx.db, { from, to })
            .whereIn("l.accountId", ids)
            .orderBy("v.voucherDate")
            .orderBy("v.id")
            .orderBy("l.sortOrder")
            .select("l.id", "l.accountId", "l.debit", "l.credit", "l.memo", "v.code", "v.type", "v.voucherDate", "v.narration", "v.party", "v.status")
        : []
      const list = entries.map((e) => ({ ...e, debit: Number(e.debit), credit: Number(e.credit) }))
      // Opening balances entered during the period come in on their day
      if (from)
        for (const a of picked)
          if (a.opening && a.openingDate && new Date(a.openingDate) >= from && new Date(a.openingDate) <= to)
            list.push({ id: `entered-${a.code}`, accountId: a.id, debit: a.opening, credit: 0, code: "", type: null, voucherDate: a.openingDate, narration: "Opening balance entered", status: "posted" })
      list.sort((a, b) => new Date(a.voucherDate) - new Date(b.voucherDate))
      let balance = opening
      const rows = [{ id: "opening", date: from ? isoDay(from) : "", narration: "Opening balance", balance }]
      for (const e of list) {
        balance = round(balance + e.debit - e.credit)
        rows.push({
          id: String(e.id),
          date: isoDay(e.voucherDate),
          voucher: e.code,
          account: byId.get(e.accountId)?.name,
          narration: [e.narration, e.memo].filter(Boolean).join(" · ") + (e.status === "void" ? " (voided)" : ""),
          party: e.party,
          received: e.debit || null,
          paid: e.credit || null,
          balance,
        })
      }
      rows.push({ id: "closing", date: isoDay(to), narration: "Closing balance", balance })
      // Closing balance by day for short periods, by month otherwise
      const daily = to - start <= 62 * DAY
      const bucket = (d) => (daily ? isoDay(d) : monthKey(d))
      const buckets = daily
        ? Array.from({ length: Math.round((pkEnd(isoDay(to)) - pkStart(isoDay(start))) / DAY) }, (_, i) => isoDay(new Date(pkStart(isoDay(start)).getTime() + i * DAY + DAY / 2)))
        : monthsBetween(start, to)
      let running = opening
      const data = buckets.map((b) => {
        running = round(
          running +
            sum(
              list.filter((e) => bucket(e.voucherDate) === b),
              (e) => e.debit - e.credit,
            ),
        )
        return { when: daily ? longDay(`${b}T12:00:00+05:00`).replace(/ \d{4}$/, "") : monthLabel(b), balance: running }
      })
      const received = round(sum(list, (e) => e.debit))
      const paid = round(sum(list, (e) => e.credit))
      return {
        columns: [
          { key: "date", header: "Date", width: 11 },
          { key: "voucher", header: "Voucher", width: 16 },
          ...(picked.length > 1 ? [{ key: "account", header: "Account", width: 18 }] : []),
          { key: "narration", header: "Narration", width: 36 },
          { key: "party", header: "Party", width: 18 },
          { key: "received", header: "Received", type: "pkr", width: 14 },
          { key: "paid", header: "Paid", type: "pkr", width: 14 },
          { key: "balance", header: "Balance", type: "pkr", width: 16 },
        ],
        rows,
        summary: [
          { label: "Opening", value: rs(opening) },
          { label: "Received", value: rs(received) },
          { label: "Paid", value: rs(paid) },
          { label: "Closing", value: rs(balance) },
        ],
        chart:
          picked.length && data.length > 1 ? { kind: "line", title: "Closing balance", categoryKey: "when", money: true, series: [{ key: "balance", label: "Closing balance", color: vizColor("blue") }], data } : null,
        note: picked.length ? (picked.length > 1 ? "Transfers between your own cash and bank accounts show on both sides." : null) : "No cash or bank accounts yet. Add them in Bank & cash.",
      }
    },
  },
  {
    id: "voucher-register",
    group: "Books",
    title: "Voucher register",
    description: "Every voucher in a period with its type, where it came from and its status.",
    icon: "file-list-3-line",
    filters: ["period", "project", "status"],
    async load(ctx, values, env) {
      let q = ctx.db("vouchers as v").whereNull("v.deletedAt")
      if (env.range.from) q = q.where("v.voucherDate", ">=", env.range.from)
      q = forProject(q.where("v.voucherDate", "<=", env.range.to), env.project)
      if (values.status && VOUCHER_STATUS[values.status]) q = q.where("v.status", values.status)
      const list = await q.orderBy("v.voucherDate").orderBy("v.id").select("v.id", "v.code", "v.type", "v.status", "v.voucherDate", "v.narration", "v.party", "v.amount", "v.source", "v.projectId", "v.reversalOf")
      const rows = list.map((v) => ({
        id: v.code,
        date: isoDay(v.voucherDate),
        voucher: v.code,
        type: typeLabel(v.type),
        source: v.reversalOf ? `${sourceLabel(v.source)} (reversal)` : sourceLabel(v.source),
        party: v.party,
        narration: v.narration,
        project: v.projectId ? (env.projects.find((p) => p.id === v.projectId)?.name ?? "—") : "Head office",
        status: VOUCHER_STATUS[v.status]?.label ?? v.status,
        amount: Number(v.amount),
      }))
      const by = (st) => list.filter((v) => v.status === st)
      const types = Object.keys(VOUCHER_TYPES)
        .map((t) => ({
          type: VOUCHER_TYPES[t].label,
          amount: round(
            sum(
              list.filter((v) => v.type === t && v.status === "posted"),
              (v) => v.amount,
            ),
          ),
        }))
        .filter((t) => t.amount)
      return {
        columns: [
          { key: "date", header: "Date", width: 11 },
          { key: "voucher", header: "Voucher", width: 16 },
          { key: "type", header: "Type", width: 6 },
          { key: "source", header: "Source", width: 18 },
          { key: "party", header: "Party", width: 18 },
          { key: "narration", header: "Narration", width: 36 },
          { key: "project", header: "Project", width: 16 },
          { key: "status", header: "Status", width: 14 },
          { key: "amount", header: "Amount", type: "pkr", width: 14 },
        ],
        rows,
        summary: [
          { label: "Vouchers", value: number(rows.length) },
          { label: "Posted", value: `${number(by("posted").length)} · ${rs(sum(by("posted"), (v) => v.amount))}` },
          { label: "Waiting for approval", value: number(by("pending").length) },
          { label: "Void", value: number(by("void").length) },
        ],
        chart: types.length ? { kind: "bar", title: "Posted by voucher type", categoryKey: "type", valueKey: "amount", valueLabel: "Amount", money: true, data: types } : null,
        note: rows.length ? null : "No vouchers in this period.",
      }
    },
  },

  // ---------------------------------------------------------------- Buyers
  {
    id: "receivables-aging",
    group: "Buyers",
    title: "Receivables aging",
    description: "What each buyer still owes on open bookings, by how late it is.",
    icon: "hourglass-line",
    filters: ["project"],
    async load(ctx, values, env) {
      if (env.project === "head-office") return { columns: agingColumns, rows: [], summary: [], note: noBuyersNote }
      let q = ctx.db("bookings as b").join("projects as p", "p.id", "b.projectId").leftJoin("units as u", "u.id", "b.unitId").whereNull("b.deletedAt").whereNotIn("b.status", ["cancelled", "refunded"])
      if (env.project) q = q.where("b.projectId", env.project)
      const bookings = await q.orderBy("b.bookedAt").select("b.id", "b.code", "b.status", "b.netPrice", "b.agreedPrice", "b.customerName", "b.customerPhone", "p.name as projectName", "u.number as unitNumber")
      const money = await ledgerFor(ctx.db, bookings)
      const rows = bookings
        .map((b) => ({ b, m: money.get(b.id) }))
        .filter(({ m }) => m && m.balance > 0)
        .map(({ b, m }) => {
          const open = m.lines.filter((l) => l.balance > 0)
          const late = (lo, hi) =>
            round(
              sum(
                open.filter((l) => l.state === "overdue" && l.daysLate >= lo && l.daysLate <= hi),
                (l) => l.balance,
              ),
            )
          return {
            id: b.code,
            booking: b.code,
            buyer: b.customerName,
            phone: b.customerPhone,
            project: b.projectName,
            unit: b.unitNumber,
            notDue:
              round(
                sum(
                  open.filter((l) => l.state !== "overdue"),
                  (l) => l.balance,
                ),
              ) || null,
            d30: late(0, 30) || null,
            d60: late(31, 60) || null,
            d90: late(61, 90) || null,
            d90plus: late(91, 1e6) || null,
            // Owed but not on a schedule yet (e.g. a token booking without a payment plan)
            unscheduled: Math.max(0, round(m.balance - sum(open, (l) => l.balance))) || null,
            total: m.balance,
          }
        })
        .sort((a, b) => (b.d90plus ?? 0) - (a.d90plus ?? 0) || (b.d90 ?? 0) - (a.d90 ?? 0) || b.total - a.total)
      const t = (k) => round(sum(rows, (r) => r[k]))
      const overdue = t("d30") + t("d60") + t("d90") + t("d90plus")
      const inBooks = env.project ? null : (await balancesAsOf(ctx.db)).find((a) => a.code === ACCOUNTS.receivable)?.net
      return {
        columns: agingColumns,
        rows,
        summary: [
          { label: "Buyers owing", value: number(rows.length) },
          { label: "Owed in all", value: rs(t("total")) },
          { label: "Overdue", value: rs(overdue) },
          inBooks == null ? { label: "Over 90 days", value: rs(t("d90plus")) } : { label: "Receivable in the books", value: rs(inBooks) },
        ],
        chart: rows.length
          ? {
              kind: "bar",
              title: "Owed by how late it is",
              categoryKey: "bucket",
              valueKey: "amount",
              valueLabel: "Owed",
              money: true,
              data: [
                ...(t("unscheduled") ? [{ bucket: "No plan yet", amount: t("unscheduled") }] : []),
                { bucket: "Not yet due", amount: t("notDue") },
                { bucket: "0–30 days", amount: t("d30") },
                { bucket: "31–60 days", amount: t("d60") },
                { bucket: "61–90 days", amount: t("d90") },
                { bucket: "Over 90 days", amount: t("d90plus") },
              ],
            }
          : null,
        note: rows.length ? "Payments that have cleared settle the oldest installments first. Cheques still in clearing aren't counted as paid." : "No buyer owes anything on an open booking.",
      }
    },
  },
  {
    id: "collections",
    group: "Buyers",
    title: "Collections by account & method",
    description: "Buyer payments that cleared in a period, by the account they went into and how they were paid.",
    icon: "hand-coin-line",
    filters: ["period", "project"],
    feature: "collections",
    async load(ctx, values, env) {
      if (env.project === "head-office") return { columns: collectionColumns, rows: [], summary: [], note: noBuyersNote }
      const { from, to } = env.range
      let q = ctx.db("receipts as r").join("bookings as b", "b.id", "r.bookingId").whereNull("r.deletedAt").where("r.status", "cleared")
      if (env.project) q = q.where("b.projectId", env.project)
      const [list, lists] = await Promise.all([q.select("r.code", "r.amount", "r.method", "r.accountId", "r.receivedOn", "r.clearedAt"), getLookups(ctx.db, ["payment-method"])])
      // A payment counts on the day it cleared (cash and transfers: the day received)
      const cleared = list.filter((r) => {
        const d = new Date(r.clearedAt ?? r.receivedOn)
        return (!from || d >= from) && d <= to
      })
      // Receipts without an account went into the default one (as posting.js moneyAccount)
      const money = env.accounts.filter((a) => !a.isHeader && ["cash", "bank"].includes(a.kind))
      const fallback = money.find((a) => a.isDefault) ?? money.find((a) => a.code === ACCOUNTS.cash)
      const accountOf = (id) => money.find((a) => a.id === id) ?? fallback
      const method = (m) => lists["payment-method"].find((x) => x.value === m)?.label ?? m
      const groups = new Map()
      for (const r of cleared) {
        const acc = accountOf(r.accountId)
        const key = `${acc?.code ?? "-"}|${r.method}`
        const g = groups.get(key) ?? { id: key, account: acc ? acc.name : "—", method: method(r.method), count: 0, amount: 0 }
        g.count += 1
        g.amount = round(g.amount + Number(r.amount))
        groups.set(key, g)
      }
      const rows = [...groups.values()].sort((a, b) => a.account.localeCompare(b.account) || b.amount - a.amount)
      const total = round(sum(rows, (r) => r.amount))
      for (const r of rows) r.share = pct(r.amount, total)
      const byMethod = new Map()
      for (const r of rows) byMethod.set(r.method, round((byMethod.get(r.method) ?? 0) + r.amount))
      const accounts = new Set(rows.map((r) => r.account))
      if (rows.length) rows.push({ id: "total", account: "Total", method: "", count: sum(rows, (r) => r.count), amount: total, share: 100 })
      return {
        columns: collectionColumns,
        rows,
        summary: [
          { label: "Collected", value: rs(total) },
          { label: "Payments", value: number(cleared.length) },
          { label: "Accounts", value: number(accounts.size) },
          { label: "Methods", value: number(byMethod.size) },
        ],
        chart: byMethod.size
          ? {
              kind: "bar",
              title: "Collected by method",
              categoryKey: "method",
              valueKey: "amount",
              valueLabel: "Collected",
              money: true,
              data: [...byMethod.entries()].map(([m, amount]) => ({ method: m, amount })).sort((a, b) => b.amount - a.amount),
            }
          : null,
        note: rows.length ? "Cheques and pay orders count once cleared; those still in clearing or bounced aren't included." : "No buyer payments cleared in this period.",
      }
    },
  },

  // ---------------------------------------------------------------- Tax & vendors
  {
    id: "tax-withheld",
    group: "Tax & vendors",
    title: "Income tax withheld",
    description: "Income tax withheld from vendors, dealers and agents in a period, for depositing with FBR.",
    icon: "government-line",
    filters: ["period", "project"],
    async load(ctx, values, env) {
      const wht = env.accounts.find((a) => a.code === ACCOUNTS.wht)
      if (!wht) return { columns: taxColumns, rows: [], summary: [], note: `Account ${ACCOUNTS.wht} isn't in the chart of accounts.` }
      const list = await bookLines(ctx.db, { ...env.range, project: env.project })
        .leftJoin("vendors as vd", "vd.id", "v.vendorId")
        .where("l.accountId", wht.id)
        .orderBy("v.voucherDate")
        .orderBy("v.id")
        .select("l.id", "l.debit", "l.credit", "l.memo", "v.code", "v.voucherDate", "v.party", "v.source", "v.status", "vd.name as vendorName", "vd.ntn", "vd.cnic")
      const rows = list.map((e) => ({
        id: String(e.id),
        date: isoDay(e.voucherDate),
        voucher: e.code,
        party: e.vendorName ?? e.party ?? "—",
        ntn: e.ntn ?? e.cnic ?? null,
        source: sourceLabel(e.source),
        memo: [e.memo, e.status === "void" ? "voided" : null].filter(Boolean).join(" · ") || null,
        withheld: Number(e.credit) || null,
        deposited: Number(e.debit) || null,
      }))
      const withheld = round(sum(rows, (r) => r.withheld))
      const deposited = round(sum(rows, (r) => r.deposited))
      const owed = env.project ? null : (await balancesAsOf(ctx.db, { asOf: env.range.to })).find((a) => a.id === wht.id)?.net
      const from = env.range.from ?? (await booksStart(ctx.db))
      const data = monthsBetween(from, env.range.to).map((m) => ({
        month: monthLabel(m),
        withheld: round(
          sum(
            list.filter((e) => monthKey(e.voucherDate) === m),
            (e) => e.credit,
          ),
        ),
      }))
      return {
        columns: taxColumns,
        rows,
        summary: [
          { label: "Withheld", value: rs(withheld) },
          { label: "Deposited or reversed", value: rs(deposited) },
          { label: "Entries", value: number(rows.length) },
          owed == null ? { label: "Net for the period", value: rs(withheld - deposited) } : { label: `Owed to FBR on ${longDay(env.range.to)}`, value: rs(-owed) },
        ],
        chart: withheld ? { kind: "bar", title: "Withheld by month", categoryKey: "month", valueKey: "withheld", valueLabel: "Withheld", money: true, data } : null,
        note: rows.length ? "Withheld: credits to Income tax withheld. Deposited or reversed: debits to it (FBR deposits, voided payments)." : "No income tax withheld in this period.",
      }
    },
  },
  {
    id: "vendor-payments",
    group: "Tax & vendors",
    title: "Vendor payments",
    description: "Payments to contractors and suppliers in a period: gross, income tax withheld and net paid.",
    icon: "store-2-line",
    filters: ["period", "project"],
    feature: "vendors",
    async load(ctx, values, env) {
      // Posted payments only: a voided payment didn't happen (its reversal carries no vendor)
      let q = ctx.db("vouchers as v").join("vendors as vd", "vd.id", "v.vendorId").whereNull("v.deletedAt").where("v.status", "posted").whereNull("v.reversalOf")
      if (env.range.from) q = q.where("v.voucherDate", ">=", env.range.from)
      q = forProject(q.where("v.voucherDate", "<=", env.range.to), env.project)
      const list = await q.orderBy("v.voucherDate").orderBy("v.id").select("v.id", "v.code", "v.voucherDate", "v.narration", "v.amount", "v.projectId", "vd.name as vendor", "vd.ntn", "vd.cnic", "vd.whtPct")
      const ids = list.map((v) => v.id)
      const moneyIds = new Set(env.accounts.filter((a) => ["cash", "bank"].includes(a.kind)).map((a) => a.id))
      const whtId = env.accounts.find((a) => a.code === ACCOUNTS.wht)?.id
      const lines = ids.length ? await ctx.db("voucherLines").whereIn("voucherId", ids).select("voucherId", "accountId", "debit", "credit") : []
      const rows = list.map((v) => {
        const own = lines.filter((l) => l.voucherId === v.id)
        const tax = round(
          sum(
            own.filter((l) => l.accountId === whtId),
            (l) => l.credit,
          ),
        )
        const net = round(
          sum(
            own.filter((l) => moneyIds.has(l.accountId)),
            (l) => l.credit - l.debit,
          ),
        )
        const gross = Number(v.amount)
        return {
          id: v.code,
          date: isoDay(v.voucherDate),
          voucher: v.code,
          vendor: v.vendor,
          ntn: v.ntn ?? v.cnic ?? null,
          narration: v.narration,
          project: v.projectId ? (env.projects.find((p) => p.id === v.projectId)?.name ?? "—") : "Head office",
          gross,
          tax: tax || null,
          rate: gross && tax ? Math.round((tax / gross) * 1000) / 10 : null,
          net: net || null,
        }
      })
      const byVendor = new Map()
      for (const r of rows) byVendor.set(r.vendor, round((byVendor.get(r.vendor) ?? 0) + r.gross))
      const gross = round(sum(rows, (r) => r.gross))
      const tax = round(sum(rows, (r) => r.tax))
      const net = round(sum(rows, (r) => r.net))
      return {
        columns: [
          { key: "date", header: "Date", width: 11 },
          { key: "voucher", header: "Voucher", width: 16 },
          { key: "vendor", header: "Vendor", width: 22 },
          { key: "ntn", header: "NTN / CNIC", width: 14 },
          { key: "narration", header: "Narration", width: 30 },
          { key: "project", header: "Project", width: 16 },
          { key: "gross", header: "Gross", type: "pkr", width: 14 },
          { key: "tax", header: "Tax withheld", type: "pkr", width: 14 },
          { key: "rate", header: "Rate", type: "pct", width: 8 },
          { key: "net", header: "Net paid", type: "pkr", width: 14 },
        ],
        rows,
        summary: [
          { label: "Payments", value: number(rows.length) },
          { label: "Gross", value: rs(gross) },
          { label: "Tax withheld", value: rs(tax) },
          { label: "Net paid", value: rs(net) },
        ],
        chart: byVendor.size
          ? {
              kind: "bar",
              title: "Paid by vendor (gross)",
              categoryKey: "vendor",
              valueKey: "gross",
              valueLabel: "Gross",
              money: true,
              data: [...byVendor.entries()]
                .map(([vendor, g]) => ({ vendor, gross: g }))
                .sort((a, b) => b.gross - a.gross)
                .slice(0, 12),
            }
          : null,
        note: rows.length ? "Net paid is what left your cash and bank accounts; a payment entered as a payable shows no net paid." : "No vendor payments in this period.",
      }
    },
  },
]

const agingColumns = [
  { key: "booking", header: "Booking", width: 16 },
  { key: "buyer", header: "Buyer", width: 22 },
  { key: "phone", header: "Phone", width: 14 },
  { key: "project", header: "Project", width: 16 },
  { key: "unit", header: "Unit", width: 10 },
  { key: "unscheduled", header: "No plan yet", type: "pkr", width: 12 },
  { key: "notDue", header: "Not yet due", type: "pkr", width: 12 },
  { key: "d30", header: "0–30 days", type: "pkr", width: 12 },
  { key: "d60", header: "31–60 days", type: "pkr", width: 12 },
  { key: "d90", header: "61–90 days", type: "pkr", width: 12 },
  { key: "d90plus", header: "Over 90 days", type: "pkr", width: 12 },
  { key: "total", header: "Total owed", type: "pkr", width: 14 },
]
const collectionColumns = [
  { key: "account", header: "Into account", width: 24 },
  { key: "method", header: "Method", width: 18 },
  { key: "count", header: "Payments", type: "number", width: 10 },
  { key: "amount", header: "Amount", type: "pkr", width: 16 },
  { key: "share", header: "Share", type: "pct", width: 8 },
]
const taxColumns = [
  { key: "date", header: "Date", width: 11 },
  { key: "voucher", header: "Voucher", width: 16 },
  { key: "party", header: "Withheld from", width: 24 },
  { key: "ntn", header: "NTN / CNIC", width: 14 },
  { key: "source", header: "Source", width: 16 },
  { key: "memo", header: "Note", width: 26 },
  { key: "withheld", header: "Withheld", type: "pkr", width: 14 },
  { key: "deposited", header: "Deposited / reversed", type: "pkr", width: 16 },
]

export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null

// Reports this workspace's plan includes (some need a Finance feature)
export const availableReports = (ctx) => REPORTS.filter((r) => !r.feature || ctx.has(r.feature))

// What the browser needs to list reports (no functions)
export const reportMeta = (r) => ({ id: r.id, group: r.group, title: r.title, description: r.description, icon: r.icon, filters: r.filters ?? [] })

// Filter choices; projects and accounts by their lowercased code (never ids)
export async function reportFilters(ctx) {
  const [projects, accounts] = await Promise.all([live(ctx.db, "projects").orderBy("name").select("code", "name"), chartOfAccounts(ctx.db)])
  const postable = accounts.filter((a) => !a.isHeader)
  return {
    period: { label: "Period", all: "This financial year", options: PERIODS.filter((p) => p.value !== "this-fy").map((p) => ({ value: p.value, label: p.label })) },
    asOf: { label: "As of", all: "Today", options: asOfChoices().map(({ value, label }) => ({ value, label })) },
    project: { label: "Project", all: "Whole business", options: [{ value: "head-office", label: "Head office" }, ...projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name }))] },
    account: { label: "Account", all: "All accounts (activity)", options: postable.map((a) => ({ value: a.code.toLowerCase(), label: accountLabel(a) })) },
    cash: { label: "Cash or bank account", all: "All cash & bank accounts", options: postable.filter((a) => ["cash", "bank"].includes(a.kind)).map((a) => ({ value: a.code.toLowerCase(), label: a.name })) },
    split: { label: "Columns", all: "Total only", options: [{ value: "project", label: "A column per project" }] },
    status: { label: "Status", all: "Any status", options: Object.entries(VOUCHER_STATUS).map(([value, s]) => ({ value, label: s.label })) },
  }
}

// Run a report for filter values from the URL → { columns, rows, summary, chart, note, values, scope }
export async function runReport(ctx, report, query, filters) {
  const values = Object.fromEntries((report.filters ?? []).map((k) => [k, String(query?.[k] ?? "").toLowerCase()]))
  const [projects, accounts] = await Promise.all([live(ctx.db, "projects").select("id", "code", "name"), chartOfAccounts(ctx.db)])
  const period = values.period && PERIODS.some((p) => p.value === values.period) ? values.period : "this-fy"
  const range = periodRange(period)
  const today = pkEnd(isoDay(new Date()))
  const asOf = asOfChoices().find((c) => c.value === values.asOf)?.date ?? today
  const project = !values.project ? null : values.project === "head-office" ? "head-office" : (projects.find((p) => p.code.toLowerCase() === values.project)?.id ?? -1)
  // Periods running to now take in the whole of today
  const env = { range: { from: range.from ? pkStart(localDay(range.from)) : null, to: range.to > new Date(Date.now() - DAY) ? today : pkEnd(localDay(range.to)) }, asOf, project, projects, accounts }
  const result = await report.load(ctx, values, env)
  const scope = (report.filters ?? [])
    .filter((k) => k !== "split")
    .map((k) => filters[k]?.options.find((o) => o.value === values[k])?.label ?? filters[k]?.all)
    .filter(Boolean)
    .join(" · ")
  return { ...result, values, scope }
}
