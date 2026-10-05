import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { getLookups } from "@/modules/lookups/server"
import * as V from "../values"

// Contacts import. One person, one record: a row matches the contact with the same CNIC, or the
// same mobile. "update" fills that contact's empty fields and adds the row's type. Each row needs a
// mobile or a CNIC; its type comes from the file or the importer's default (options.defaultType).

const RELATIONS = { "s/o": "S/O", so: "S/O", son: "S/O", "d/o": "D/O", do: "D/O", daughter: "D/O", "w/o": "W/O", wo: "W/O", wife: "W/O" }

export const contactsImporter = {
  key: "contacts",
  async prepare(ctx, options = {}) {
    const types = (await getLookups(ctx.db, ["contact-type"]))["contact-type"]
    const fallback = types.find((t) => t.value === options.defaultType && t.isActive)?.value ?? types.find((t) => t.value === "customer")?.value ?? types[0]?.value
    return { ctx, types, fallback, seen: new Set() }
  },

  async check(prep, r) {
    const errors = []
    const warnings = []
    const take = (res, field, warn = false) => {
      if (!res) return null
      if (res.error) {
        ;(warn ? warnings : errors).push(`${field}: ${res.error}${warn ? " (left empty)" : ""}`)
        return null
      }
      return res.value
    }
    const name = take(V.text(r.name, 150), "Name")
    if (!name) errors.push("Name is empty")
    const phone = take(V.phone(r.phone), "Mobile")
    const cnic = take(V.cnic(r.cnic), "CNIC")
    if (!phone && !cnic && !errors.some((e) => /^(Mobile|CNIC)/.test(e))) errors.push("Needs a mobile or a CNIC")
    const type = take(V.lookup(prep.types, r.type, "contact type"), "Contact type", true) ?? prep.fallback
    const relation = V.isEmpty(r.guardianRelation) ? null : (RELATIONS[String(r.guardianRelation).trim().toLowerCase()] ?? null)
    if (!V.isEmpty(r.guardianRelation) && !relation) warnings.push(`Relation: “${r.guardianRelation}” isn't S/O, D/O or W/O (left empty)`)
    const data = {
      name,
      phone,
      cnic,
      type,
      kind: /company|firm|business|org/i.test(String(r.kind ?? "")) ? "company" : "person",
      email: take(V.email(r.email), "Email", true),
      company: take(V.text(r.company, 150), "Company"),
      designation: take(V.text(r.designation, 100), "Designation"),
      guardianRelation: relation,
      guardianName: take(V.text(r.guardianName, 150), "Father / husband name"),
      city: take(V.text(r.city, 80), "City"),
      address: take(V.text(r.address, 500), "Address"),
      notes: take(V.text(r.notes, 1000), "Notes"),
    }
    const key = cnic ? `c:${cnic}` : `p:${phone}`
    if (prep.seen.has(key)) warnings.push("Same CNIC or mobile as an earlier row")
    return { data, errors, warnings, label: [name, cnic ?? phone].filter(Boolean).join(" · ") || "(empty row)" }
  },

  async match(prep, d) {
    const q = () => live(prep.ctx.db, "contacts").select("id", "code")
    return (d.cnic ? await q().where({ cnic: d.cnic }).first() : null) ?? (d.phone ? await q().where({ phone: d.phone }).first() : null)
  },

  remember(prep, d) {
    if (d) prep.seen.add(d.cnic ? `c:${d.cnic}` : `p:${d.phone}`)
  },

  row(d) {
    return {
      kind: d.kind,
      name: d.name,
      phone: d.phone,
      whatsapp: Boolean(d.phone),
      email: d.email,
      cnic: d.cnic,
      city: d.city,
      overseas: d.phone ? !d.phone.startsWith("+92") : false,
      address: d.address,
      company: d.company,
      designation: d.designation,
      guardianRelation: d.guardianName ? d.guardianRelation : null,
      guardianName: d.guardianName,
      notes: d.notes,
    }
  },

  async create(prep, d) {
    const uid = prep.ctx.user.id
    await prep.ctx.db.transaction(async (trx) => {
      const code = await nextCode(trx, "contact")
      const [id] = await trx("contacts").insert({ ...this.row(d), code, createdBy: uid })
      if (d.type) await trx("contactLinks").insert({ contactId: id, linkableType: "contact", linkableId: id, role: d.type, createdBy: uid })
    })
  },

  // Fill empty fields (a CNIC only if nobody else has it) and add the type
  async update(prep, existing, d) {
    const { db } = prep.ctx
    const uid = prep.ctx.user.id
    const c = await db("contacts").where({ id: existing.id }).first()
    const row = this.row(d)
    const patch = {}
    for (const k of ["email", "city", "address", "company", "designation", "guardianRelation", "guardianName", "phone"]) if ((c[k] == null || c[k] === "") && row[k] != null) patch[k] = row[k]
    if (!c.cnic && row.cnic && !(await live(db, "contacts").where({ cnic: row.cnic }).whereNot({ id: c.id }).first("id"))) patch.cnic = row.cnic
    if (row.notes && !(c.notes ?? "").includes(row.notes)) patch.notes = [c.notes, row.notes].filter(Boolean).join("\n").slice(0, 1000)
    const hasType = d.type ? await live(db, "contactLinks").where({ contactId: c.id, role: d.type }).first("id") : true
    if (!Object.keys(patch).length && hasType) return false
    await db.transaction(async (trx) => {
      if (Object.keys(patch).length)
        await trx("contacts")
          .where({ id: c.id })
          .update({ ...patch, updatedAt: new Date(), updatedBy: uid })
      if (!hasType) await trx("contactLinks").insert({ contactId: c.id, linkableType: "contact", linkableId: c.id, role: d.type, createdBy: uid })
    })
    return true
  },
}
