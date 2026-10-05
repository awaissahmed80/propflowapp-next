import "server-only"
import { live } from "@/server/db/records"
import { urlCode } from "@/lib/url"
import { formatPkPhone } from "@/lib/phone"
import { maskCnic } from "@/lib/cnic"
import { getLookups } from "@/modules/lookups/server"
import { appPath } from "@/modules/portal/app-paths"
import { scoped as crmScoped } from "@/modules/crm/server/context"
import { scoped as contactsScoped } from "@/modules/contacts/server/context"
import { scoped as salesScoped } from "@/modules/operations/server/context"
import { scoped as servicesScoped } from "@/modules/estate/server/context"
import { scoped as hrScoped } from "@/modules/hr/server/context"
import { ACCOUNT_TYPES, VOUCHER_STATUS, VOUCHER_TYPES } from "@/modules/finance/constants"

// Record search for Spotlight (⌘K), one function per group. Each takes the app's own context
// (crmContext(), salesContext()…) and a parsed term, and limits rows exactly as the app's list
// pages do (the same scoped() helpers), so search never shows a row the app would hide.
//   → [{ value, label, meta, icon, href }], at most LIMIT, an exact code first

export const LIMIT = 5

// "  0300-1234567 " → { text, like, upper, prefix, phone: "3001234567", cnic: "03001234567" }
//   phone: digits to find in stored +92… numbers (leading 0 / 92 dropped), when the term looks like a number
//   cnic:  digits to find in CNICs with their dashes taken out
export function parseTerm(query) {
  const text = String(query ?? "").trim()
  const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`)
  const numeric = /^[\d\s+\-()]+$/.test(text)
  const digits = text.replace(/\D/g, "")
  const phone = numeric && digits.length >= 4 ? digits.replace(/^(0092|92|0)/, "") : null
  return {
    text,
    like: `%${escaped}%`,
    upper: text.toUpperCase(),
    prefix: `${escaped.toUpperCase()}%`,
    phone: phone && phone.length >= 3 ? phone : null,
    cnic: numeric && digits.length >= 5 ? digits : null,
  }
}

// Any of the text columns contain the term; phone and CNIC columns match on digits.
// cnic: CNIC columns, only for people who may see full CNICs (contacts.cnic), so a search can't
// reveal a masked number
function matching(q, t, { text = [], phone = [], cnic = [] }) {
  return q.where((w) => {
    for (const col of text) w.orWhere(col, "like", t.like)
    if (t.phone) for (const col of phone) w.orWhere(col, "like", `%${t.phone}%`)
    if (t.cnic) for (const col of cnic) w.orWhereRaw("REPLACE(??, '-', '') LIKE ?", [col, `%${t.cnic}%`])
  })
}

// The exact code first, then codes starting with the term, then the rest
const byCode = (q, t, col) => q.orderByRaw("CASE WHEN ?? = ? THEN 0 WHEN ?? LIKE ? THEN 1 ELSE 2 END", [col, t.upper, col, t.prefix])

// A pick-list value's label; one the list doesn't have reads "On leave" from "on-leave"
const labelOf = (list, value) =>
  list?.find((v) => v.value === value)?.label ??
  (value
    ? String(value)
        .replace(/[-_]/g, " ")
        .replace(/^./, (c) => c.toUpperCase())
    : null)
const join = (...parts) => parts.filter(Boolean).join(" · ")
const phoneText = (v) => (v ? formatPkPhone(v) : null)
const size = (value, unit) => (value == null ? null : `${Number(value)} ${unit ?? ""}`.trim())

// ---------- CRM ----------

// Leads this person may see (own / team / all, plus tagged); CNIC through the lead's contacts
export async function searchLeads(ctx, t, { cnic = false } = {}) {
  const db = ctx.db
  let q = crmScoped(ctx, live(db, "leads"))
  q = q.where((w) => {
    matching(w, t, { text: ["leads.code", "leads.name", "leads.email"], phone: ["leads.phone"] })
    if (cnic && t.cnic)
      w.orWhereExists((x) =>
        x
          .select(db.raw("1"))
          .from("contactLinks as k")
          .join("contacts as c", "c.id", "k.contactId")
          .whereColumn("k.linkableId", "leads.id")
          .where("k.linkableType", "lead")
          .whereNull("k.deletedAt")
          .whereNull("c.deletedAt")
          .whereRaw("REPLACE(??, '-', '') LIKE ?", ["c.cnic", `%${t.cnic}%`]),
      )
  })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "leads.code").orderBy("leads.createdAt", "desc").limit(LIMIT).select("leads.code", "leads.name", "leads.phone", "leads.status", "leads.archivedAt"),
    getLookups(db, ["lead-status"]),
  ])
  return rows.map((l) => ({
    value: `lead:${l.code}`,
    label: l.name || l.code,
    meta: join(l.code, phoneText(l.phone), l.archivedAt ? "Archived" : labelOf(lists["lead-status"], l.status)),
    icon: "user-star-line",
    href: `${appPath("crm")}/leads?lead=${urlCode(l.code)}`,
  }))
}

// ---------- Contacts ----------

const contactColumns = ["contacts.code", "contacts.name", "contacts.phone", "contacts.cnic", "contacts.city"]
const contactItem = (c, t, cnic, href) => ({
  value: `contact:${c.code}`,
  label: c.name || c.code,
  meta: join(c.code, phoneText(c.phone), t.cnic && c.cnic ? maskCnic(c.cnic, cnic) : c.city),
  icon: "contacts-book-2-line",
  href,
})

// The Contacts directory, as far as the role's contacts scope reaches (linked | all)
export async function searchContacts(ctx, t, { cnic = false } = {}) {
  const q = matching(contactsScoped(ctx, live(ctx.db, "contacts")), t, {
    text: ["contacts.code", "contacts.name", "contacts.email", "contacts.company"],
    phone: ["contacts.phone"],
    cnic: cnic ? ["contacts.cnic"] : [],
  })
  const rows = await byCode(q, t, "contacts.code").orderBy("contacts.name").limit(LIMIT).select(contactColumns)
  return rows.map((c) => contactItem(c, t, cnic, `${appPath("contacts")}/${urlCode(c.code)}`))
}

// CRM without the Contacts app: only the people behind leads this person may see (as CRM's
// Contacts page lists them)
export async function searchLeadContacts(ctx, t, { cnic = false } = {}) {
  const db = ctx.db
  const q = matching(live(db, "contacts"), t, {
    text: ["contacts.code", "contacts.name", "contacts.email"],
    phone: ["contacts.phone"],
    cnic: cnic ? ["contacts.cnic"] : [],
  }).whereExists((x) =>
    crmScoped(
      ctx,
      x
        .select(db.raw("1"))
        .from("contactLinks as k")
        .join("leads as l", "l.id", "k.linkableId")
        .whereColumn("k.contactId", "contacts.id")
        .where("k.linkableType", "lead")
        .whereNull("k.deletedAt")
        .whereNull("l.deletedAt"),
      "l",
    ),
  )
  const rows = await byCode(q, t, "contacts.code").orderBy("contacts.name").limit(LIMIT).select(contactColumns)
  return rows.map((c) => contactItem(c, t, cnic, `${appPath("crm")}/contacts/${urlCode(c.code)}`))
}

// ---------- Operations ----------

// Bookings they handle, their team's or all (by the operations scope), and ones they sold
export async function searchBookings(ctx, t, { cnic = false } = {}) {
  const db = ctx.db
  const q = matching(
    salesScoped(ctx, db("bookings as b").whereNull("b.deletedAt"), "b").join("units as u", "u.id", "b.unitId").join("projects as p", "p.id", "b.projectId").leftJoin("contacts as c", "c.id", "b.contactId"),
    t,
    {
      text: ["b.code", "b.allotmentNo", "b.customerName", "c.name", "c.code", "u.code", "u.number"],
      phone: ["b.customerPhone", "c.phone"],
      cnic: cnic ? ["c.cnic"] : [],
    },
  )
  const [rows, lists] = await Promise.all([
    byCode(q, t, "b.code").orderBy("b.bookedAt", "desc").limit(LIMIT).select("b.code", "b.stage", "b.status", "b.customerName", "c.name as contactName", "u.number as unitNumber", "p.name as projectName"),
    getLookups(db, ["booking-stage", "booking-status"]),
  ])
  return rows.map((b) => ({
    value: `booking:${b.code}`,
    label: b.code,
    meta: join(b.contactName ?? b.customerName, `${b.projectName} ${b.unitNumber}`, ["cancelled", "refunded"].includes(b.status) ? labelOf(lists["booking-status"], b.status) : labelOf(lists["booking-stage"], b.stage)),
    icon: "hand-coin-line",
    href: `${appPath("operations")}/bookings/${urlCode(b.code)}`,
  }))
}

// ---------- Project Portfolio (no scope: everyone with the app sees every project and unit) ----------

export async function searchProjects(ctx, t) {
  const q = matching(live(ctx.db, "projects"), t, { text: ["projects.code", "projects.name", "projects.city", "projects.location"] })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "projects.code").orderBy("projects.sortOrder").orderBy("projects.name").limit(LIMIT).select("code", "name", "city", "status"),
    getLookups(ctx.db, ["project-status"]),
  ])
  return rows.map((p) => ({
    value: `project:${p.code}`,
    label: p.name,
    meta: join(p.code, p.city, labelOf(lists["project-status"], p.status)),
    icon: "community-line",
    href: `${appPath("portfolio")}/projects/${urlCode(p.code)}`,
  }))
}

export async function searchUnits(ctx, t) {
  const q = matching(live(ctx.db, "units").join("projects as p", "p.id", "units.projectId").whereNull("p.deletedAt").leftJoin("projectBlocks as k", "k.id", "units.blockId"), t, {
    text: ["units.code", "units.number"],
  })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "units.code")
      .orderByRaw("CASE WHEN ?? = ? THEN 0 ELSE 1 END", ["units.number", t.text])
      .orderBy("units.id")
      .limit(LIMIT)
      .select("units.code", "units.number", "units.type", "units.sizeValue", "units.sizeUnit", "units.status", "p.name as projectName", "k.name as blockName"),
    getLookups(ctx.db, ["unit-type", "unit-status"]),
  ])
  return rows.map((u) => ({
    value: `unit:${u.code}`,
    label: `${u.projectName} ${u.number}`,
    meta: join(u.code, u.blockName, labelOf(lists["unit-type"], u.type), size(u.sizeValue, u.sizeUnit), labelOf(lists["unit-status"], u.status)),
    icon: "layout-grid-line",
    href: `${appPath("portfolio")}/inventory?unit=${urlCode(u.code)}`,
  }))
}

// ---------- Estate Management ----------

// Requests assigned to them (and unassigned), their team's or all (by the estate scope)
export async function searchRequests(ctx, t, { cnic = false } = {}) {
  const db = ctx.db
  const q = matching(servicesScoped(ctx, db("serviceRequests as r").whereNull("r.deletedAt"), "r").leftJoin("contacts as c", "c.id", "r.contactId").leftJoin("bookings as b", "b.id", "r.bookingId"), t, {
    text: ["r.code", "r.subject", "c.name", "c.code", "b.code"],
    phone: ["c.phone"],
    cnic: cnic ? ["c.cnic"] : [],
  })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "r.code").orderBy("r.createdAt", "desc").limit(LIMIT).select("r.code", "r.type", "r.status", "r.subject", "c.name as contactName"),
    getLookups(db, ["service-request-type", "service-status"]),
  ])
  return rows.map((r) => ({
    value: `request:${r.code}`,
    label: r.subject || r.code,
    meta: join(r.code, labelOf(lists["service-request-type"], r.type), r.contactName, labelOf(lists["service-status"], r.status)),
    icon: "inbox-line",
    href: `${appPath("estate")}/requests/${urlCode(r.code)}`,
  }))
}

// ---------- Finance (one set of books: Finance view sees everything) ----------

export async function searchVouchers(ctx, t) {
  const q = matching(live(ctx.db, "vouchers"), t, { text: ["vouchers.code", "vouchers.party", "vouchers.reference", "vouchers.chequeNo", "vouchers.narration"] })
  const rows = await byCode(q, t, "vouchers.code").orderBy("vouchers.voucherDate", "desc").orderBy("vouchers.id", "desc").limit(LIMIT).select("code", "type", "status", "party", "narration")
  return rows.map((v) => ({
    value: `voucher:${v.code}`,
    label: v.code,
    meta: join(VOUCHER_TYPES[v.type]?.label, v.party || v.narration, VOUCHER_STATUS[v.status]?.label),
    icon: "file-list-3-line",
    href: `${appPath("finance")}/vouchers?open=${urlCode(v.code)}`,
  }))
}

// Accounts that have a statement (headings don't)
export async function searchAccounts(ctx, t) {
  const q = matching(live(ctx.db, "accounts").where({ isHeader: false }), t, { text: ["accounts.code", "accounts.name", "accounts.bankName", "accounts.accountTitle"] })
  const rows = await byCode(q, t, "accounts.code").orderBy("accounts.code").limit(LIMIT).select("code", "name", "type", "kind", "bankName", "isActive")
  return rows.map((a) => ({
    value: `account:${a.code}`,
    label: a.name,
    meta: join(a.code, a.bankName ?? ACCOUNT_TYPES[a.type]?.label ?? a.type, a.isActive ? null : "Inactive"),
    icon: "node-tree",
    href: `${appPath("finance")}/accounts/${urlCode(a.code)}`,
  }))
}

export async function searchPaymentRequests(ctx, t, { cnic = false } = {}) {
  const q = matching(ctx.db("paymentRequests as q").whereNull("q.deletedAt").leftJoin("bookings as b", "b.id", "q.bookingId").leftJoin("contacts as c", "c.id", "q.contactId"), t, {
    text: ["q.code", "b.code", "b.customerName", "c.name", "c.code"],
    phone: ["c.phone", "b.customerPhone"],
    cnic: cnic ? ["c.cnic"] : [],
  })
  const rows = await byCode(q, t, "q.code").orderBy("q.issuedOn", "desc").orderBy("q.id", "desc").limit(LIMIT).select("q.code", "q.status", "b.code as bookingCode", "b.customerName", "c.name as contactName")
  const STATUS = { issued: "Issued", paid: "Paid", cancelled: "Canceled" }
  return rows.map((r) => ({
    value: `payment-request:${r.code}`,
    label: r.code,
    meta: join(r.contactName ?? r.customerName, r.bookingCode, STATUS[r.status] ?? r.status),
    icon: "file-text-line",
    href: `${appPath("finance")}/payment-requests?open=${urlCode(r.code)}`,
  }))
}

// ---------- HR ----------

// Employee records by the hr scope (their own / their teams' / everyone's). Never pay.
export async function searchEmployees(ctx, t, { cnic = false } = {}) {
  const q = matching(hrScoped(ctx, live(ctx.db, "employees")), t, {
    text: ["employees.code", "employees.name", "employees.email", "employees.designation"],
    phone: ["employees.phone"],
    cnic: cnic ? ["employees.cnic"] : [],
  })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "employees.code").orderBy("employees.name").limit(LIMIT).select("employees.code", "employees.name", "employees.designation", "employees.department", "employees.status"),
    getLookups(ctx.db, ["designation", "department"]),
  ])
  return rows.map((e) => ({
    value: `employee:${e.code}`,
    label: e.name,
    meta: join(e.code, labelOf(lists.designation, e.designation), labelOf(lists.department, e.department), e.status === "active" ? null : labelOf(null, e.status)),
    icon: "team-line",
    href: `${appPath("hr")}/employees/${urlCode(e.code)}`,
  }))
}

// ---------- Documents ----------

// Current versions of company documents whose type this person may see ("Who can see")
export async function searchDocuments(ctx, t) {
  if (!ctx.visibleTypes.length) return []
  const q = matching(live(ctx.db, "assets").where({ "assets.app": "documents" }).whereNull("assets.supersededAt").whereIn("assets.category", ctx.visibleTypes), t, {
    text: ["assets.code", "assets.title", "assets.fileName", "assets.note"],
  }).leftJoin("projects as p", "p.id", "assets.projectId")
  const rows = await q
    .orderByRaw("CASE WHEN ?? = ? THEN 0 ELSE 1 END", ["assets.code", t.text.toLowerCase()])
    .orderBy("assets.createdAt", "desc")
    .limit(LIMIT)
    .select("assets.code", "assets.title", "assets.fileName", "assets.category", "p.name as projectName")
  return rows.map((a) => ({
    value: `document:${a.code}`,
    label: a.title || a.fileName,
    meta: join(labelOf(ctx.types, a.category), a.projectName),
    icon: "folder-5-line",
    href: `${appPath("documents")}/${urlCode(a.code)}`,
  }))
}

// ---------- Campaigns (no scope: everyone with the app sees every campaign) ----------

export async function searchCampaigns(ctx, t) {
  const q = matching(live(ctx.db, "campaigns").leftJoin("projects as p", "p.id", "campaigns.projectId"), t, { text: ["campaigns.code", "campaigns.name"] })
  const [rows, lists] = await Promise.all([
    byCode(q, t, "campaigns.code").orderBy("campaigns.createdAt", "desc").limit(LIMIT).select("campaigns.code", "campaigns.name", "campaigns.status", "p.name as projectName"),
    getLookups(ctx.db, ["campaign-status"]),
  ])
  return rows.map((c) => ({
    value: `campaign:${c.code}`,
    label: c.name,
    meta: join(c.code, c.projectName, labelOf(lists["campaign-status"], c.status)),
    icon: "megaphone-line",
    href: `${appPath("campaigns")}/all/${urlCode(c.code)}`,
  }))
}
