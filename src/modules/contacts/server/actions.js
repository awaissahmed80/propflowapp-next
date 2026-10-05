"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { getLookups } from "@/modules/lookups/server"
import { CNIC_PATTERN, formatCnic, isMaskedCnic } from "@/lib/cnic"
import { normalizePhone } from "@/lib/phone"
import { contactsAction, scoped } from "./context"
import { MERGE_FIELDS, mergePreview } from "./queries"

// Contacts: add and change people and firms, merge two records of one person, delete strays and
// export the directory. Adding needs contacts.create; changes and merges contacts.edit.

const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const text = (max) => z.string().trim().max(max).optional().default("")
const upper = (v) => String(v ?? "").toUpperCase()

const contactSchema = z.object({
  kind: z.enum(["person", "company"]).optional().default("person"),
  name: z.string().trim().min(2, "Their full name.").max(150),
  phone: z.string().trim().min(1, "A mobile number, e.g. 0300 1234567.").max(30),
  whatsapp: z.boolean().optional().default(true),
  email: z.string().trim().email("Check the email.").max(190).or(z.literal("")).optional().default(""),
  cnic: text(20),
  city: text(80),
  overseas: z.boolean().optional().default(false),
  address: text(255),
  company: text(150),
  designation: text(80),
  guardianRelation: z.enum(["S/O", "D/O", "W/O", ""]).optional().default(""),
  guardianName: text(150),
  notes: text(2000),
  types: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
})

// A contact this person may see, by code
const findContact = (ctx, code) => scoped(ctx, live(ctx.db, "contacts")).where("contacts.code", upper(code)).first("contacts.*")

// Add (code empty) or change a contact → { ok, code } | { error } | { fieldErrors, clash? }
// clash: { code, name } of the contact that already has this mobile or CNIC (an Open link)
export async function saveContact(code, input) {
  const { ctx, error } = await contactsAction(code ? "edit" : "create")
  if (error) return { error }
  const parsed = contactSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const db = ctx.db

  const existing = code ? await findContact(ctx, code) : null
  if (code && !existing) return { error: "That contact was removed or isn't yours to see." }

  const phone = normalizePhone(v.phone)
  if (!phone) return { fieldErrors: { phone: "Enter a Pakistani mobile (0300 1234567) or an international number starting with +." } }
  // A masked CNIC coming back from the form means "unchanged"
  let cnic = null
  if (isMaskedCnic(v.cnic)) {
    if (!existing) return { fieldErrors: { cnic: "Type the CNIC in full." } }
    cnic = existing.cnic
  } else if (v.cnic) {
    cnic = formatCnic(v.cnic)
    if (!CNIC_PATTERN.test(cnic)) return { fieldErrors: { cnic: "CNIC like 35202-1234567-1." } }
  }
  if (v.guardianName && !v.guardianRelation) return { fieldErrors: { guardianRelation: "S/O, D/O or W/O." } }

  // Contact types: the ones picked here are kept as the contact's own; types that come from their
  // leads, bookings and other records stay whatever is picked
  const typeValues = (await getLookups(db, ["contact-type"]))["contact-type"]
  const known = new Set(typeValues.map((t) => t.value))
  const active = new Set(typeValues.filter((t) => t.isActive).map((t) => t.value))
  const linkedTypes = existing ? (await live(db, "contactLinks").where({ contactId: existing.id }).whereNot({ linkableType: "contact" }).distinct("role")).map((r) => r.role) : []
  const prevOwn = existing ? await live(db, "contactLinks").where({ contactId: existing.id, linkableType: "contact" }).select("id", "role") : []
  const picked = [...new Set(v.types)].filter((t) => known.has(t))
  if (picked.some((t) => !active.has(t) && !prevOwn.some((o) => o.role === t))) return { fieldErrors: { types: "That type is switched off. Pick another." } }
  const own = picked.filter((t) => !linkedTypes.includes(t))
  if (!own.length && !linkedTypes.length) return { fieldErrors: { types: "Pick at least one type." } }

  // One person, one record: mobile and CNIC can't belong to someone else
  const other = (where) =>
    live(db, "contacts")
      .where(where)
      .whereNot({ id: existing?.id ?? 0 })
      .first("code", "name")
  if (cnic && cnic !== existing?.cnic) {
    const clash = await other({ cnic })
    if (clash) return { fieldErrors: { cnic: `${clash.name} already has this CNIC.` }, clash }
  }
  if (phone !== existing?.phone) {
    const clash = await other({ phone })
    if (clash) return { fieldErrors: { phone: `${clash.name} already has this mobile number.` }, clash }
  }

  const row = {
    kind: v.kind,
    name: v.name,
    phone,
    whatsapp: v.whatsapp,
    email: v.email || null,
    cnic,
    city: v.city || null,
    overseas: v.overseas,
    address: v.address || null,
    company: v.company || null,
    designation: v.designation || null,
    guardianRelation: v.guardianName ? v.guardianRelation : null,
    guardianName: v.guardianName || null,
    notes: v.notes || null,
  }
  const now = new Date()
  let out = existing?.code
  await db.transaction(async (trx) => {
    let id = existing?.id
    if (existing)
      await trx("contacts")
        .where({ id })
        .update({ ...row, updatedAt: now, updatedBy: ctx.user.id })
    else {
      out = await nextCode(trx, "contact")
      ;[id] = await trx("contacts").insert({ ...row, code: out, createdBy: ctx.user.id })
    }
    const drop = prevOwn.filter((o) => !own.includes(o.role)).map((o) => o.id)
    if (drop.length) await trx("contactLinks").whereIn("id", drop).update({ deletedAt: now, deletedBy: ctx.user.id })
    const add = own.filter((t) => !prevOwn.some((o) => o.role === t))
    if (add.length) await trx("contactLinks").insert(add.map((role) => ({ contactId: id, linkableType: "contact", linkableId: id, role, createdBy: ctx.user.id })))
  })
  await logActivity(db, { type: "contacts", action: existing ? "contact.updated" : "contact.created", actorUserId: ctx.user.id, summary: `${existing ? "updated" : "added"} contact ${v.name} (${out})` })
  return { ok: true, code: out }
}

// What merging mergeCode into keepCode would move (the Merge dialog) → { preview } | { error }
export async function previewMerge(keepCode, mergeCode) {
  const { ctx, error } = await contactsAction("edit")
  if (error) return { error }
  const preview = await mergePreview(ctx, keepCode, mergeCode)
  return preview ? { preview } : { error: "One of these contacts was removed or isn't yours to see." }
}

// Two records of one person → one. Everything on the merged contact (leads, bookings, requests,
// payment requests, dealer firm, employee record, login) moves to the kept one, which takes any
// details it was missing; the merged contact is deleted. → { ok, code } | { error }
export async function mergeContacts(keepCode, mergeCode) {
  const { ctx, error } = await contactsAction("edit")
  if (error) return { error }
  const [keep, merge] = await Promise.all([findContact(ctx, keepCode), findContact(ctx, mergeCode)])
  if (!keep || !merge) return { error: "One of these contacts was removed or isn't yours to see." }
  if (keep.id === merge.id) return { error: "Pick two different contacts." }
  const now = new Date()
  const by = ctx.user.id
  await ctx.db.transaction(async (trx) => {
    // The merged contact goes first, so its CNIC is free for the kept one
    await trx("contacts").where({ id: merge.id }).update({ deletedAt: now, deletedBy: by })

    // Links: re-pointed, unless the kept contact already has the same one
    const keepLinks = await live(trx, "contactLinks").where({ contactId: keep.id }).select("linkableType", "linkableId", "role")
    const has = (type, id, role) => keepLinks.some((k) => k.linkableType === type && k.linkableId === id && k.role === role)
    for (const k of await live(trx, "contactLinks").where({ contactId: merge.id }).select("id", "linkableType", "linkableId", "role")) {
      const linkableId = k.linkableType === "contact" ? keep.id : k.linkableId
      if (has(k.linkableType, linkableId, k.role)) await trx("contactLinks").where({ id: k.id }).update({ deletedAt: now, deletedBy: by })
      else {
        await trx("contactLinks").where({ id: k.id }).update({ contactId: keep.id, linkableId, updatedAt: now, updatedBy: by })
        keepLinks.push({ linkableType: k.linkableType, linkableId, role: k.role })
      }
    }
    // Records that point at the contact directly
    for (const table of ["bookings", "serviceRequests", "paymentRequests", "employees"]) await trx(table).where({ contactId: merge.id }).update({ contactId: keep.id })

    // Details the kept contact was missing
    const fill = Object.fromEntries(
      Object.keys(MERGE_FIELDS)
        .filter((k) => !keep[k] && merge[k])
        .map((k) => [k, merge[k]]),
    )
    if (fill.guardianName && !keep.guardianRelation) fill.guardianRelation = merge.guardianRelation
    if (keep.notes && merge.notes && keep.notes !== merge.notes) fill.notes = `${keep.notes}\n\n${merge.notes}`.slice(0, 5000)
    if (merge.overseas && !keep.overseas) fill.overseas = true
    await trx("contacts")
      .where({ id: keep.id })
      .update({ ...fill, updatedAt: now, updatedBy: by })
  })
  await logActivity(ctx.db, { type: "contacts", action: "contact.merged", actorUserId: ctx.user.id, summary: `merged contact ${merge.name} (${merge.code}) into ${keep.name} (${keep.code})` })
  return { ok: true, code: keep.code }
}

// Delete a contact nobody uses: no leads, bookings, requests or other records on them
// → { ok } | { error }
export async function deleteContact(code) {
  const { ctx, error } = await contactsAction("delete")
  if (error) return { error }
  const c = await findContact(ctx, code)
  if (!c) return { error: "That contact was removed or isn't yours to see." }
  const db = ctx.db
  const [link, ...direct] = await Promise.all([
    live(db, "contactLinks").where({ contactId: c.id }).whereNot({ linkableType: "contact" }).first("id"),
    ...["bookings", "serviceRequests", "paymentRequests", "employees"].map((t) => live(db, t).where({ contactId: c.id }).first("id")),
  ])
  if (link || direct.some(Boolean)) return { error: `${c.name} has leads, bookings or other records. Merge them into another contact instead.` }
  const now = new Date()
  await db.transaction(async (trx) => {
    await trx("contactLinks").where({ contactId: c.id }).whereNull("deletedAt").update({ deletedAt: now, deletedBy: ctx.user.id })
    await trx("contacts").where({ id: c.id }).update({ deletedAt: now, deletedBy: ctx.user.id })
  })
  await logActivity(db, { type: "contacts", action: "contact.deleted", actorUserId: ctx.user.id, summary: `deleted contact ${c.name} (${c.code})` })
  return { ok: true }
}

// Rows for an Excel export of these contacts (the list as filtered); CNICs stay masked without
// contacts.cnic → { rows } | { error }
export async function exportContacts(codes) {
  const { ctx, error } = await contactsAction("export")
  if (error) return { error }
  const list = [...new Set((Array.isArray(codes) ? codes : []).map(upper))].slice(0, 20000)
  if (!list.length) return { rows: [] }
  const db = ctx.db
  const rows = await scoped(ctx, live(db, "contacts"))
    .whereIn("contacts.code", list)
    .orderBy("contacts.name")
    .select(
      "contacts.id",
      "contacts.code",
      "contacts.name",
      "contacts.phone",
      "contacts.whatsapp",
      "contacts.email",
      "contacts.cnic",
      "contacts.city",
      "contacts.overseas",
      "contacts.address",
      "contacts.company",
      "contacts.designation",
      "contacts.guardianRelation",
      "contacts.guardianName",
      "contacts.createdAt",
    )
  const roles = rows.length
    ? await live(db, "contactLinks")
        .whereIn(
          "contactId",
          rows.map((r) => r.id),
        )
        .distinct("contactId", "role")
    : []
  const typesOf = new Map()
  for (const r of roles) typesOf.set(r.contactId, [...(typesOf.get(r.contactId) ?? []), r.role])
  await logActivity(db, { type: "contacts", action: "contact.exported", actorUserId: ctx.user.id, summary: `exported ${rows.length} contacts` })
  return {
    rows: rows.map(({ id, cnic, whatsapp, overseas, guardianRelation, guardianName, ...r }) => ({
      ...r,
      cnic: ctx.cnic(cnic) ?? "",
      guardian: guardianName ? `${guardianRelation ?? ""} ${guardianName}`.trim() : "",
      whatsapp: whatsapp ? "Yes" : "No",
      overseas: overseas ? "Yes" : "",
      types: typesOf.get(id) ?? [],
    })),
  }
}
