// Finance rules shared by the server and the browser: voucher types, where each kind of money
// posts (system account codes from the seeded chart), and the July–June financial year.

export const VOUCHER_TYPES = {
  jv: { short: "JV", label: "Journal voucher", icon: "file-list-3-line" },
  crv: { short: "CRV", label: "Cash receipt", icon: "hand-coin-line" },
  cpv: { short: "CPV", label: "Cash payment", icon: "wallet-3-line" },
  brv: { short: "BRV", label: "Bank receipt", icon: "bank-card-line" },
  bpv: { short: "BPV", label: "Bank payment", icon: "bank-line" },
}

export const VOUCHER_STATUS = {
  pending: { label: "Waiting for approval", color: "amber" },
  posted: { label: "Posted", color: "green" },
  rejected: { label: "Sent back", color: "red" },
  void: { label: "Void", color: "gray" },
}

// Where a voucher came from; the other apps post theirs automatically
export const VOUCHER_SOURCES = {
  manual: { label: "Entered in Finance", icon: "edit-line" },
  booking: { label: "Booking", icon: "hand-coin-line" },
  receipt: { label: "Payment received", icon: "money-dollar-circle-line" },
  cheque: { label: "Cheque", icon: "bank-card-2-line" },
  cancellation: { label: "Cancellation", icon: "close-circle-line" },
  refund: { label: "Refund", icon: "refund-2-line" },
  commission: { label: "Commission", icon: "percent-line" },
  fee: { label: "Service fee", icon: "home-gear-line" },
  payroll: { label: "Payroll", icon: "team-line" },
}

// System accounts (seed: src/server/db/seeds/tenant/03_accounts.js). Renamed freely; codes stay.
export const ACCOUNTS = {
  cash: "1110",
  clearing: "1200",
  receivable: "1300",
  staffLoans: "1800",
  wht: "2300",
  refunds: "2400",
  eobi: "2700",
  sales: "4100",
  transferFees: "4200",
  documentFees: "4300",
  possessionFees: "4400",
  cancellation: "4500",
  otherIncome: "4600",
  commission: "6100",
  salaries: "6300",
}

// Estate Management fees by request type
export const FEE_ACCOUNT = { transfer: ACCOUNTS.transferFees, ndc: ACCOUNTS.documentFees, document: ACCOUNTS.documentFees, "record-update": ACCOUNTS.documentFees, possession: ACCOUNTS.possessionFees }

export const ACCOUNT_TYPES = {
  asset: { label: "Asset", normal: "debit" },
  liability: { label: "Liability", normal: "credit" },
  equity: { label: "Equity", normal: "credit" },
  income: { label: "Income", normal: "credit" },
  expense: { label: "Expense", normal: "debit" },
}

// Receipts into a cash account are CRV, into a bank BRV; payments CPV / BPV; anything else JV
export const voucherTypeFor = (direction, kind) => (direction === "in" ? (kind === "cash" ? "crv" : "brv") : direction === "out" ? (kind === "cash" ? "cpv" : "bpv") : "jv")

// A balance in the account's normal direction (credit accounts read positive when in credit)
export const signedBalance = (type, debit, credit) => (ACCOUNT_TYPES[type]?.normal === "credit" ? credit - debit : debit - credit)

// Financial year July–June: the one a date falls in → { start, end, label: "FY 2026-27" }
export function financialYearOf(date = new Date(), startMonth = 7) {
  const d = new Date(date)
  const y = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1
  const start = new Date(y, startMonth - 1, 1)
  const end = new Date(y + 1, startMonth - 1, 0, 23, 59, 59, 999)
  return { start, end, label: `FY ${y}-${String(y + 1).slice(-2)}` }
}

// Period presets for reports and statements → { from, to } (Date | null)
export const PERIODS = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-fy", label: "This financial year" },
  { value: "last-fy", label: "Last financial year" },
  { value: "all", label: "All time" },
]
export function periodRange(value, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  if (value === "this-month") return { from: new Date(y, m, 1), to: now }
  if (value === "last-month") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) }
  if (value === "last-3-months") return { from: new Date(y, m - 2, 1), to: now }
  if (value === "this-fy") return { from: financialYearOf(now).start, to: now }
  if (value === "last-fy") {
    const last = financialYearOf(new Date(financialYearOf(now).start.getTime() - 86_400_000))
    return { from: last.start, to: last.end }
  }
  return { from: null, to: now }
}

// Accounting figure: (1,234) for negatives, blank for zero
export const figure = (n) => {
  const v = Math.round(Number(n) || 0)
  if (!v) return ""
  const s = new Intl.NumberFormat("en-PK").format(Math.abs(v))
  return v < 0 ? `(${s})` : s
}
