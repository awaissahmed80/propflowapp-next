"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { financeAction } from "./context"

// Finance › Vendors: contractors and suppliers, with the income tax withheld on their payments.
// New ones need finance.create; changes and deactivating need finance.edit.

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const text = (max) => z.string().trim().max(max).optional().default("")

const vendorSchema = z.object({
  name: z.string().trim().min(2, "The vendor's name.").max(150),
  category: text(30),
  accountId: z.coerce.number().int().positive().optional().nullable(),
  whtPct: z.coerce.number().min(0, "0% or more.").max(50, "Up to 50%.").optional().default(0),
  ntn: text(20),
  cnic: z
    .string()
    .trim()
    .regex(/^(\d{5}-\d{7}-\d)?$/, "CNIC like 35202-1234567-1.")
    .optional()
    .default(""),
  phone: text(20),
  email: z.string().trim().email("Check the email.").max(150).or(z.literal("")).optional().default(""),
  address: text(300),
  bankName: text(100),
  accountTitle: text(150),
  accountNumber: text(40),
  notes: text(500),
})

// Add (code empty) or change a vendor → { ok, code } | { error } | { fieldErrors }
export async function saveVendor(code, input) {
  const { ctx, error } = await financeAction(code ? "edit" : "create")
  if (error) return { error }
  const parsed = vendorSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  if (v.category && !isLookupValue((await getLookups(ctx.db, ["vendor-category"]))["vendor-category"], v.category)) return { fieldErrors: { category: "Pick a category." } }
  if (v.accountId && !(await live(ctx.db, "accounts").where({ id: v.accountId, isHeader: false }).whereIn("type", ["expense", "asset"]).first("id")))
    return { fieldErrors: { accountId: "Pick an expense or asset account." } }
  const existing = code
    ? await live(ctx.db, "vendors")
        .where({ code: String(code).toUpperCase() })
        .first("id", "code")
    : null
  if (code && !existing) return { error: "That vendor was removed." }
  const clash = await live(ctx.db, "vendors")
    .where({ name: v.name })
    .whereNot({ id: existing?.id ?? 0 })
    .first("code")
  if (clash) return { fieldErrors: { name: `There's already a vendor by that name (${clash.code}).` } }
  const row = {
    name: v.name,
    category: v.category || null,
    accountId: v.accountId ?? null,
    whtPct: v.whtPct,
    ntn: v.ntn || null,
    cnic: v.cnic || null,
    phone: v.phone || null,
    email: v.email || null,
    address: v.address || null,
    bankName: v.bankName || null,
    accountTitle: v.accountTitle || null,
    accountNumber: v.accountNumber || null,
    notes: v.notes || null,
  }
  const now = new Date()
  let out = existing?.code
  if (existing)
    await ctx
      .db("vendors")
      .where({ id: existing.id })
      .update({ ...row, updatedAt: now, updatedBy: ctx.user.id })
  else
    await ctx.db.transaction(async (trx) => {
      out = await nextCode(trx, "vendor")
      await trx("vendors").insert({ ...row, code: out, isActive: true, createdBy: ctx.user.id })
    })
  await logActivity(ctx.db, { type: "finance", action: existing ? "vendor.updated" : "vendor.created", actorUserId: ctx.user.id, summary: `${existing ? "updated" : "added"} vendor ${v.name} (${out})` })
  return { ok: true, code: out }
}

// Deactivate (hidden from new payments; history stays) or reactivate a vendor → { ok } | { error }
export async function setVendorActive(code, active) {
  const { ctx, error } = await financeAction("edit")
  if (error) return { error }
  const v = await live(ctx.db, "vendors")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "name")
  if (!v) return { error: "That vendor was removed." }
  await ctx
    .db("vendors")
    .where({ id: v.id })
    .update({ isActive: Boolean(active), updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "finance", action: active ? "vendor.activated" : "vendor.deactivated", actorUserId: ctx.user.id, summary: `${active ? "reactivated" : "deactivated"} vendor ${v.name} (${v.code})` })
  return { ok: true }
}
