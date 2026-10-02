"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { requireTenant } from "@/server/auth/dal"
import { live } from "@/server/db/records"
import { deleteFile, readFile, saveFile } from "@/server/storage"
import { detectFileType } from "@/server/storage/file-types"
import { canSetUp, db, getSetup, readSettings, writeSettings } from "./setup"
import { logActivity } from "@/server/tenants/activity"

// Setup steps for a new workspace. Each action checks the person may change workspace settings.

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]
const LOGO_MAX = 2 * 1024 * 1024
const round2 = (n) => Math.round(n * 100) / 100
const fieldErrors = (e) => Object.fromEntries(e.issues.map((i) => [i.path[0], i.message]))

async function requireSetupAccess() {
  const s = await requireTenant("/setup")
  const role = await live(db(s.tenant), "roles").where({ id: s.membership.roleId }).first("permissions")
  if (!canSetUp(role?.permissions ?? [])) return { error: "Only the workspace owner or an admin with settings access can do this." }
  return { s }
}

// ---------- company profile ----------

const optional = (max) => z.string().trim().max(max).nullable().optional()
const profileSchema = z.object({
  company_name: z.string().trim().min(2, "Enter the name customers know you by.").max(150),
  company_legal_name: z.string().trim().min(2, "Enter the registered name, e.g. Skyline Developers (Pvt) Ltd.").max(200),
  company_address: z.string().trim().min(5, "Enter the office address.").max(255),
  company_city: z.string().trim().min(2, "Enter the city.").max(60),
  company_phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Enter a phone number, e.g. 042 35761234."),
  company_email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  company_ntn: optional(20).refine((v) => !v || /^\d{7}-?\d$|^\d{13}$/.test(v.replace(/\s/g, "")), "An NTN is 7 digits and a check digit (1234567-8), or a 13-digit CNIC."),
  company_strn: optional(20),
  company_secp: optional(30),
  company_website: optional(150),
})

export async function saveCompanyProfile(input) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const values = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v || null]))
  await writeSettings(s.tenant, values, s.user.id)
  await logActivity(db(s.tenant), { type: "settings", action: "setup.saveCompanyProfile", actorUserId: s.user.id, summary: "updated the company profile" })
  return { ok: true }
}

// ---------- logo ----------

// A PNG, JPG or WebP (up to 2 MB) shown on receipts, letters and invoices
export async function uploadLogo(formData) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const file = formData?.get?.("logo")
  if (!(file instanceof File) || !file.size) return { error: "Choose your logo file." }
  if (file.size > LOGO_MAX) return { error: "The logo is over 2 MB. Save a smaller PNG or JPG." }
  const buffer = Buffer.from(await file.arrayBuffer())
  const type = detectFileType(buffer)
  if (!type || !LOGO_TYPES.includes(type.mime)) return { error: "Use a PNG, JPG or WebP image. (SVG isn't accepted.)" }
  const key = await saveFile({ folder: `tenants/${s.tenant.code.toLowerCase()}/branding`, buffer, ext: type.ext })
  const old = (await readSettings(s.tenant, ["company_logo"])).company_logo
  await writeSettings(s.tenant, { company_logo: key, company_logo_type: type.mime }, s.user.id)
  if (old) await deleteFile(old).catch(() => {})
  await logActivity(db(s.tenant), { type: "settings", action: "setup.uploadLogo", actorUserId: s.user.id, summary: "uploaded a new company logo" })
  return { ok: true }
}

export async function removeLogo() {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const old = (await readSettings(s.tenant, ["company_logo"])).company_logo
  await writeSettings(s.tenant, { company_logo: null, company_logo_type: null }, s.user.id)
  if (old) await deleteFile(old).catch(() => {})
  await logActivity(db(s.tenant), { type: "settings", action: "setup.removeLogo", actorUserId: s.user.id, summary: "removed the company logo" })
  return { ok: true }
}

// ---------- cash & bank accounts ----------

const bankSchema = z.object({
  bankName: z.string().trim().min(2, "Enter the bank.").max(100),
  accountTitle: z.string().trim().min(2, "Enter the account title.").max(150),
  accountNumber: z.string().trim().min(4, "Enter the account number.").max(40),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => !v || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), "A Pakistani IBAN is 24 characters: PK, 2 digits, 4 letters, 16 digits."),
  branch: z.string().trim().max(150).optional(),
  purpose: z.string().trim().max(60).optional(), // Collections, Payroll, Current…
  openingBalance: z.number().min(0).max(100_000_000_000).default(0),
  isDefault: z.boolean().default(false),
})

// Next free code under Cash & bank (1130, 1140, … then 1131, …)
async function nextBankCode(tdb) {
  const used = new Set(await tdb("accounts").where("code", "like", "11%").pluck("code"))
  for (let n = 1130; n <= 1199; n += 10) if (!used.has(String(n))) return String(n)
  for (let n = 1131; n <= 1199; n++) if (!used.has(String(n))) return String(n)
  throw new Error("No more bank account codes free under 1100.")
}

export async function saveBankAccount(id, input) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const parsed = bankSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const v = parsed.data
  const tdb = db(s.tenant)
  const name = `${v.bankName}${v.purpose ? ` · ${v.purpose}` : ""}`
  const row = {
    name,
    bankName: v.bankName,
    accountTitle: v.accountTitle,
    accountNumber: v.accountNumber,
    iban: v.iban || null,
    branch: v.branch || null,
    description: v.purpose || null,
    openingBalance: round2(v.openingBalance),
    openingDate: new Date(),
    updatedAt: new Date(),
    updatedBy: s.user.id,
  }
  await tdb.transaction(async (trx) => {
    const banks = await live(trx, "accounts").where({ kind: "bank" }).select("id", "isDefault")
    // The first bank account is where receipts go unless someone picks another
    const makeDefault = v.isDefault || !banks.some((b) => b.isDefault && b.id !== Number(id))
    if (makeDefault) await trx("accounts").where({ kind: "bank" }).update({ isDefault: false })
    if (id) {
      const updated = await live(trx, "accounts")
        .where({ id: Number(id), kind: "bank" })
        .update({ ...row, isDefault: makeDefault })
      if (!updated) throw new Error("Bank account not found.")
    } else {
      const code = await nextBankCode(trx)
      await trx("accounts").insert({ ...row, code, type: "asset", parentCode: "1100", kind: "bank", isDefault: makeDefault, sortOrder: Number(code), createdBy: s.user.id })
    }
  })
  await logActivity(db(s.tenant), { type: "settings", action: "setup.saveBankAccount", actorUserId: s.user.id, summary: id ? "updated a bank account" : "added a bank account" })
  return { ok: true }
}

export async function removeBankAccount(id) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const tdb = db(s.tenant)
  const acc = await live(tdb, "accounts")
    .where({ id: Number(id), kind: "bank" })
    .first("id", "isDefault")
  if (!acc) return { error: "Bank account not found." }
  // Soft delete; once vouchers exist, accounts with entries will be closed instead
  await tdb("accounts").where({ id: acc.id }).update({ deletedAt: new Date(), deletedBy: s.user.id, isDefault: false })
  if (acc.isDefault) {
    const next = await live(tdb, "accounts").where({ kind: "bank" }).orderBy("code").first("id")
    if (next) await tdb("accounts").where({ id: next.id }).update({ isDefault: true })
  }
  await logActivity(db(s.tenant), { type: "settings", action: "setup.removeBankAccount", actorUserId: s.user.id, summary: "removed a bank account" })
  return { ok: true }
}

// Opening balance of cash in hand (1110) and petty cash (1120)
export async function saveCashOpening(input) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const tdb = db(s.tenant)
  for (const code of ["1110", "1120"]) {
    const amount = Number(input?.[code] ?? 0)
    if (!Number.isFinite(amount) || amount < 0) return { fieldErrors: { [code]: "Enter zero or more." } }
    await live(tdb, "accounts")
      .where({ code, kind: "cash" })
      .update({ openingBalance: round2(amount), openingDate: new Date(), updatedAt: new Date(), updatedBy: s.user.id })
  }
  await logActivity(db(s.tenant), { type: "settings", action: "setup.saveCashOpening", actorUserId: s.user.id, summary: "set the cash in hand opening balance" })
  return { ok: true }
}

// ---------- preferences ----------

const prefsSchema = z.object({
  financial_year_start_month: z.number().int().min(1).max(12),
  marla_sq_ft: z.union([z.literal(225), z.literal(250), z.literal(272)]),
})

export async function savePreferences(input) {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const parsed = prefsSchema.safeParse(input)
  if (!parsed.success) return { error: "Pick the options again." }
  await writeSettings(s.tenant, { ...parsed.data, setup_preferences_saved_at: new Date().toISOString() }, s.user.id)
  await logActivity(db(s.tenant), { type: "settings", action: "setup.savePreferences", actorUserId: s.user.id, summary: "updated workspace preferences" })
  return { ok: true }
}

// ---------- finish ----------

// Once the required steps are done: mark setup complete and open the launcher with the tour
export async function completeSetup() {
  const { s, error } = await requireSetupAccess()
  if (error) return { error }
  const setup = await getSetup(s.tenant)
  if (!setup.requiredDone) return { error: "Fill in the company profile first." }
  if (!setup.completedAt) {
    await writeSettings(s.tenant, { setup_completed_at: new Date().toISOString() }, s.user.id)
    await logActivity(db(s.tenant), { type: "settings", action: "setup.completed", actorUserId: s.user.id, summary: "finished setting up the workspace" })
  }
  redirect("/?tour=1")
}

// The logo as a data URL for the setup preview (small; avoids another route for now)
export async function logoPreview() {
  const { s, error } = await requireSetupAccess()
  if (error) return null
  const { company_logo: key, company_logo_type: type } = await readSettings(s.tenant, ["company_logo", "company_logo_type"])
  if (!key) return null
  const file = await readFile(key).catch(() => null)
  return file ? `data:${type || "image/png"};base64,${file.toString("base64")}` : null
}
