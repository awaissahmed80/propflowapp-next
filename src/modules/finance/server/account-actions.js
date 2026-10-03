"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { financeAction } from "./context"
import { getVoucher } from "./queries"

// Chart of accounts and bank & cash accounts (finance.edit). Codes are given, never typed: the
// next free one under the heading (highest sibling + 10). Cash and bank accounts sit under 1100
// Cash & bank, like the ones added during setup (portal/server/setup-actions.js). System accounts
// (the ones the apps post to) can be renamed; their code, heading and type stay, and nothing is
// ever deleted: accounts without postings can be switched off instead.

const CASH_BANK = "1100"
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const round2 = (v) => Math.round(Number(v) * 100) / 100
const text = (max) => z.string().trim().max(max).optional().default("")
const log = (ctx, action, summary) => logActivity(ctx.db, { type: "finance", action, actorUserId: ctx.user.id, summary })

const accountSchema = z.object({
  parentCode: z.string().trim().max(20).optional().default(""),
  name: z.string().trim().max(150).optional().default(""),
  description: text(255),
  kind: z.enum(["", "cash", "bank"]).optional().default(""),
  bankName: text(100),
  accountTitle: text(150),
  accountNumber: text(40),
  iban: z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => !v || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), "A Pakistani IBAN is 24 characters: PK, 2 digits, 4 letters, 16 digits."),
  branch: text(150),
  openingBalance: z.coerce.number().min(-100_000_000_000).max(100_000_000_000).optional().default(0),
  openingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date.")
    .optional()
    .nullable()
    .or(z.literal("")),
  isDefault: z.boolean().optional().default(false),
})

// The next free code under a heading: highest sibling + 10 while that stays inside the heading's
// range (1100 → 1101–1199), else the first free code in the range. Deleted codes count as used.
async function nextCode(trx, parent) {
  const prefix = parent.code.replace(/0+$/, "") || parent.code
  const width = parent.code.length
  const low = Number(prefix.padEnd(width, "0"))
  const high = Number(prefix.padEnd(width, "9"))
  const used = new Set((await trx("accounts").where("code", "like", `${prefix}%`).pluck("code")).map(String))
  const siblings = (await trx("accounts").where({ parentCode: parent.code }).pluck("code")).map(Number).filter(Number.isFinite)
  const free = (c) => c > Number(parent.code) && c > low && c <= high && !used.has(String(c).padStart(width, "0"))
  const next = Math.max(Number(parent.code), ...siblings) + 10
  if (free(next)) return String(next).padStart(width, "0")
  for (let c = Number(parent.code) + 10; c <= high; c += 10) if (free(c)) return String(c).padStart(width, "0")
  for (let c = Number(parent.code) + 1; c <= high; c++) if (free(c)) return String(c).padStart(width, "0")
  return null
}

class FieldError extends Error {
  constructor(fields) {
    super("Check the form.")
    this.fields = fields
  }
}

const openingDate = (v) => (v ? new Date(`${v}T12:00:00+05:00`) : null)

// Add (code empty) or change an account → { ok, code } | { error } | { fieldErrors }
//   input: { parentCode (new only), name, description, kind: "" | cash | bank (new, under 1100),
//            bankName, accountTitle, accountNumber, iban, branch, openingBalance, openingDate, isDefault }
export async function saveAccount(code, input) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const parsed = accountSchema.safeParse(input ?? {})
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const existing = code
    ? await live(ctx.db, "accounts")
        .where({ code: String(code) })
        .first("id", "code", "name", "type", "parentCode", "isHeader", "kind", "isSystem", "isDefault")
    : null
  if (code && !existing) return { error: "That account was removed." }

  const kind = existing ? existing.kind : v.kind || null
  const bank = kind === "bank"
  const name = v.name || (bank ? v.bankName : "")
  const missing = {}
  if (bank) {
    if (v.bankName.length < 2) missing.bankName = "Enter the bank."
    if (v.accountTitle.length < 2) missing.accountTitle = "Enter the account title."
    if (v.accountNumber.length < 4) missing.accountNumber = "Enter the account number."
  }
  if (name.length < 2) missing.name = "Enter the account name."
  if (Object.keys(missing).length) return { fieldErrors: missing }
  const row = { name, description: v.description || null, updatedAt: new Date(), updatedBy: ctx.user.id }
  if (!existing?.isHeader) Object.assign(row, { openingBalance: round2(v.openingBalance), openingDate: openingDate(v.openingDate) ?? (v.openingBalance ? new Date() : null) })
  if (bank) Object.assign(row, { bankName: v.bankName, accountTitle: v.accountTitle, accountNumber: v.accountNumber, iban: v.iban || null, branch: v.branch || null })

  let saved
  try {
    await ctx.db.transaction(async (trx) => {
      if (existing) {
        await trx("accounts").where({ id: existing.id }).update(row)
        saved = existing.code
      } else {
        const parentCode = v.kind ? CASH_BANK : v.parentCode
        const parent = await live(trx, "accounts").where({ code: parentCode, isHeader: true }).first("code", "type")
        if (!parent) throw new FieldError({ parentCode: "Pick the heading it goes under." })
        if (parent.code !== CASH_BANK && v.kind) throw new FieldError({ parentCode: "Cash and bank accounts go under Cash & bank." })
        const next = await nextCode(trx, parent)
        if (!next) throw new FieldError({ parentCode: "There are no codes left under this heading. Pick another." })
        await trx("accounts").insert({ ...row, code: next, type: parent.type, parentCode: parent.code, isHeader: false, kind, isSystem: false, isDefault: false, sortOrder: Number(next), createdBy: ctx.user.id })
        saved = next
      }
      // One default cash or bank account for the whole workspace
      if (kind && v.isDefault) {
        await trx("accounts").where({ isDefault: true }).whereNot({ code: saved }).update({ isDefault: false })
        await trx("accounts").where({ code: saved }).whereNull("deletedAt").update({ isDefault: true })
      } else if (existing?.isDefault && kind && !v.isDefault) {
        await trx("accounts").where({ id: existing.id }).update({ isDefault: false })
      }
    })
  } catch (err) {
    if (err instanceof FieldError) return { fieldErrors: err.fields }
    throw err
  }
  await log(ctx, existing ? "account.updated" : "account.added", `${existing ? "changed" : "added"} account ${saved} ${name}`)
  return { ok: true, code: saved }
}

// Make a cash or bank account the default (where money goes unless someone picks another) → { ok } | { error }
export async function setDefaultAccount(code) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const acc = await live(ctx.db, "accounts")
    .where({ code: String(code ?? "") })
    .whereIn("kind", ["cash", "bank"])
    .first("id", "code", "name", "isActive")
  if (!acc) return { error: "Pick a cash or bank account." }
  if (!acc.isActive) return { error: "Switch the account on first." }
  await ctx.db.transaction(async (trx) => {
    await trx("accounts").where({ isDefault: true }).update({ isDefault: false })
    await trx("accounts").where({ id: acc.id }).update({ isDefault: true, updatedAt: new Date(), updatedBy: ctx.user.id })
  })
  await log(ctx, "account.default", `made ${acc.code} ${acc.name} the default account`)
  return { ok: true }
}

// Switch an account off (hidden from the voucher forms) or back on → { ok } | { error }.
// System accounts and accounts with postings stay on.
export async function setAccountActive(code, active) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const acc = await live(ctx.db, "accounts")
    .where({ code: String(code ?? "") })
    .first("id", "code", "name", "isSystem", "isHeader", "isDefault", "isActive")
  if (!acc) return { error: "That account was removed." }
  if (!active) {
    if (acc.isSystem) return { error: "The apps post to this account, so it stays on. You can rename it." }
    if (acc.isHeader) return { error: "Headings can't be switched off." }
    if (acc.isDefault) return { error: "This is the default account. Make another one the default first." }
    const used = await ctx.db("voucherLines as l").join("vouchers as v", "v.id", "l.voucherId").whereNull("v.deletedAt").where("l.accountId", acc.id).first("l.id")
    if (used) return { error: "This account has postings, so it stays on." }
  }
  await ctx
    .db("accounts")
    .where({ id: acc.id })
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: ctx.user.id })
  await log(ctx, active ? "account.activated" : "account.deactivated", `${active ? "switched on" : "switched off"} account ${acc.code} ${acc.name}`)
  return { ok: true }
}

// A voucher for the view dialog on pages that don't load it themselves → { voucher } | { error }
export async function loadVoucher(code) {
  const { ctx, error } = await financeAction("view")
  if (error) return { error }
  const voucher = await getVoucher(ctx, code)
  return voucher ? { voucher } : { error: "That voucher was removed." }
}
