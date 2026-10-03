import "server-only"
import { live } from "@/server/db/records"
import { ACCOUNT_TYPES } from "../constants"

// Balances from the books, for Finance reports (and anything else that needs a balance).
//
// WHICH VOUCHERS COUNT: status "posted" and "void".
// Voiding (posting.js reverseVoucher) marks the original "void" AND posts a reversing JV (status
// "posted", reversal_of = the original, dated the day it's voided). Counting only "posted" would
// keep the reversal but drop the original, leaving the books upside down. Counting both posted
// and void lets the original and its reversal net to zero from the void date on, and keeps the
// original in the period it happened (the books as they stood then). Pending (waiting in
// Approvals) and rejected vouchers never reach the books.
export const IN_BOOKS = ["posted", "void"]

// Opening balances (accounts.opening_balance, entered at setup) are amounts in the account's
// normal direction as of opening_date. They aren't tagged to a project, so they count only for the
// whole business. They have no other side, so reports show the difference as "Opening balances"
// under equity (what the owners put in) to keep the books balanced.

const round = (n) => Math.round(Number(n) * 100) / 100

// Every account in the chart, in order → [{ id, code, name, type, parentCode, isHeader, kind, opening, openingDate }]
export async function chartOfAccounts(db) {
  const rows = await live(db, "accounts")
    .orderBy("sortOrder")
    .orderBy("code")
    .select("id", "code", "name", "type", "parentCode", "isHeader", "kind", "isActive", "isDefault", "openingBalance", "openingDate", "bankName", "accountNumber")
  return rows.map((a) => ({ ...a, isHeader: Boolean(a.isHeader), opening: Number(a.openingBalance ?? 0) }))
}

// An opening balance as debit minus credit
export const openingNet = (a) => (ACCOUNT_TYPES[a.type]?.normal === "credit" ? -a.opening : a.opening)
// Whether an account's opening balance had started by a date (no date: from the beginning)
export const openedBy = (a, date) => Boolean(a.opening) && (!a.openingDate || !date || new Date(a.openingDate) <= date)

// project: null (whole business) | "head-office" (vouchers without a project) | a project id
export function forProject(q, project, column = "v.projectId") {
  if (project === "head-office") return q.whereNull(column)
  if (project) return q.where(column, project)
  return q
}

// Voucher lines that count in the books, joined to their voucher; narrowed by date and project
export function bookLines(db, { from = null, to = null, before = null, project = null } = {}) {
  let q = db("voucherLines as l").join("vouchers as v", "v.id", "l.voucherId").whereNull("v.deletedAt").whereIn("v.status", IN_BOOKS)
  if (from) q = q.where("v.voucherDate", ">=", from)
  if (to) q = q.where("v.voucherDate", "<=", to)
  if (before) q = q.where("v.voucherDate", "<", before)
  return forProject(q, project)
}

// Debits and credits per account → Map(accountId → { debit, credit })
export async function totalsByAccount(db, range = {}) {
  const rows = await bookLines(db, range).groupBy("l.accountId").select("l.accountId").sum({ debit: "l.debit", credit: "l.credit" })
  return new Map(rows.map((r) => [r.accountId, { debit: round(r.debit ?? 0), credit: round(r.credit ?? 0) }]))
}

// Each non-header account's balance as of a date, as debit minus credit (opening included for
// the whole business) → [{ ...account, net }]
export async function balancesAsOf(db, { asOf = null, project = null } = {}) {
  const [accounts, totals] = await Promise.all([chartOfAccounts(db), totalsByAccount(db, { to: asOf, project })])
  return accounts
    .filter((a) => !a.isHeader)
    .map((a) => {
      const t = totals.get(a.id) ?? { debit: 0, credit: 0 }
      const opening = !project && openedBy(a, asOf) ? openingNet(a) : 0
      return { ...a, net: round(opening + t.debit - t.credit) }
    })
}
