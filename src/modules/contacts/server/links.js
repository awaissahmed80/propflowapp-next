import "server-only"
import { nextCode } from "@/server/db/numbering"

// The central contacts table and its links (see migration 20261008100029_contacts). Apps call
// these inside their own transaction when they save a record about a person:
//   const contactId = await ensureContact(trx, { name, phone, email, city }, userId)
//   await linkContact(trx, contactId, { type: "lead", id: leadId, role: "lead" }, userId)
// so the same person (matched by mobile) is one contact, whatever they are to the business.

// Existing contact on this mobile (or a new one); fills details the contact doesn't have yet
export async function ensureContact(trx, { name, phone, whatsapp, email, city, overseas, company, kind = "person" }, userId) {
  const now = new Date()
  const found = phone ? await trx("contacts").where({ phone }).whereNull("deletedAt").orderBy("id").first() : null
  if (found) {
    const fill = Object.fromEntries(
      Object.entries({ email, city, company })
        .filter(([k, v]) => v && !found[k])
        .map(([k, v]) => [k, v]),
    )
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
    city: city || null,
    overseas: Boolean(overseas),
    company: company || null,
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
