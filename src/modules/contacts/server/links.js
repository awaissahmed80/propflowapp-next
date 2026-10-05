import "server-only"
import { nextCode } from "@/server/db/numbering"

// The central contacts table and its links (see migration 20261008100029_contacts). Apps call
// these inside their own transaction when they save a record about a person:
//   const contactId = await ensureContact(trx, { name, phone, email, city }, userId)
//   await linkContact(trx, contactId, { type: "lead", id: leadId, role: "lead" }, userId)
// so the same person (matched by CNIC or mobile) is one contact, whatever they are to the business.

// Existing contact with this CNIC or mobile (or a new one); fills details the contact doesn't
// have yet. The CNIC is only filled in when no other contact already has it.
export async function ensureContact(trx, { name, phone, whatsapp, email, city, overseas, company, designation, address, cnic, guardianRelation, guardianName, kind = "person" }, userId) {
  const now = new Date()
  const found = (cnic ? await trx("contacts").where({ cnic }).whereNull("deletedAt").orderBy("id").first() : null) ?? (phone ? await trx("contacts").where({ phone }).whereNull("deletedAt").orderBy("id").first() : null)
  if (found) {
    const fill = Object.fromEntries(
      Object.entries({ email, city, company, designation, address, guardianRelation, guardianName })
        .filter(([k, v]) => v && !found[k])
        .map(([k, v]) => [k, v]),
    )
    if (phone && !found.phone) fill.phone = phone
    if (cnic && !found.cnic && !(await trx("contacts").where({ cnic }).whereNull("deletedAt").first("id"))) fill.cnic = cnic
    if (overseas && !found.overseas) fill.overseas = true
    if (Object.keys(fill).length)
      await trx("contacts")
        .where({ id: found.id })
        .update({ ...fill, updatedAt: now, updatedBy: userId })
    return found.id
  }
  const code = await nextCode(trx, "contact")
  const [id] = await trx("contacts").insert({
    code,
    kind,
    name,
    phone: phone || null,
    whatsapp: whatsapp ?? true,
    email: email || null,
    cnic: cnic || null,
    city: city || null,
    overseas: Boolean(overseas),
    company: company || null,
    designation: designation || null,
    address: address || null,
    guardianRelation: guardianRelation || null,
    guardianName: guardianName || null,
    createdBy: userId,
  })
  return id
}

// Link a record to a contact (once); role is a contact-type value (lead, customer, dealer…)
export async function linkContact(trx, contactId, { type, id, role }, userId) {
  const exists = await trx("contactLinks").where({ contactId, linkableType: type, linkableId: id }).whereNull("deletedAt").first("id")
  if (!exists) await trx("contactLinks").insert({ contactId, linkableType: type, linkableId: id, role, createdBy: userId })
}

// A record now belongs to another contact (e.g. a lead's mobile was corrected)
export async function relinkContact(trx, contactId, { type, id, role }, userId) {
  const now = new Date()
  await trx("contactLinks").where({ linkableType: type, linkableId: id }).whereNot({ contactId }).whereNull("deletedAt").update({ deletedAt: now, deletedBy: userId })
  await linkContact(trx, contactId, { type, id, role }, userId)
}

// The contact a record is linked to (its id), or null
export async function contactOf(db, type, id) {
  const row = await db("contactLinks").where({ linkableType: type, linkableId: id }).whereNull("deletedAt").orderBy("id").first("contactId")
  return row?.contactId ?? null
}
