import { externalId, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// Contacts: one central record per person or firm the business deals with, linked to the records
// they appear on (polymorphic, like assets): a lead, a booking, a dealer firm, a workspace member,
// later employees, owners, tenants, vendors… One contact, many links; each link says what they
// are on that record (role: a contact-type value: lead, customer, dealer, agent, employee…), so a
// contact's types come from its links. Matched by mobile (and CNIC once captured), so the same
// person is never entered twice. Existing leads, bookings and dealers are linked below.
export async function up(knex) {
  await knex.schema.createTable("contacts", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // CT-00001: in URLs (lowercased)
    t.string("kind", 10).notNullable().defaultTo("person") // person | company
    t.string("name", 150).notNullable()
    t.string("phone", 20).nullable().index() // +923001234567
    t.boolean("whatsapp").notNullable().defaultTo(true)
    t.string("email", 190).nullable()
    t.string("cnic", 15).nullable() // 35202-1234567-1
    t.string("city", 80).nullable()
    t.boolean("overseas").notNullable().defaultTo(false)
    t.string("address", 255).nullable()
    t.string("company", 150).nullable()
    t.string("designation", 80).nullable()
    t.text("notes").nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "contacts", "cnic")

  await knex.schema.createTable("contact_links", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("contact_id").unsigned().notNullable().index()
    t.string("linkable_type", 40).notNullable() // lead | booking | dealer | member | employee | owner…
    externalId(t, "linkable_id").notNullable()
    t.string("role", 40).notNullable() // contact-type: lead | customer | dealer | agent | employee…
    timestamps(t, knex)
    t.index(["linkable_type", "linkable_id"])
  })
  await uniqueAlive(knex, "contact_links", ["contact_id", "linkable_type", "linkable_id"])

  await knex("sequences").insert({ key: "contact", prefix: "CT", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never", next_value: 1 }).onConflict("key").ignore()

  // Existing people: leads (one contact per mobile, newest details win), their bookings, dealers
  const seq = await knex("sequences").where({ key: "contact" }).first()
  let next = Number(seq.next_value)
  const byPhone = new Map()
  const now = new Date()
  const create = async (row) => {
    const code = `CT-${String(next++).padStart(5, "0")}`
    const [id] = await knex("contacts").insert({ ...row, code, created_at: row.created_at ?? now, updated_at: now })
    return id
  }
  const link = (contactId, type, id, role, at) => knex("contact_links").insert({ contact_id: contactId, linkable_type: type, linkable_id: id, role, created_at: at ?? now, updated_at: now })

  const leads = await knex("leads").whereNull("deleted_at").orderBy("created_at", "desc").select("id", "name", "phone", "whatsapp", "email", "city", "overseas", "created_at", "created_by")
  for (const l of leads) {
    let contactId = byPhone.get(l.phone)
    if (!contactId) {
      const first = leads.filter((x) => x.phone === l.phone).at(-1)
      contactId = await create({
        name: l.name,
        phone: l.phone,
        whatsapp: l.whatsapp,
        email: leads.find((x) => x.phone === l.phone && x.email)?.email ?? null,
        city: leads.find((x) => x.phone === l.phone && x.city)?.city ?? null,
        overseas: l.overseas,
        created_at: first.created_at,
        created_by: first.created_by,
      })
      byPhone.set(l.phone, contactId)
    }
    await link(contactId, "lead", l.id, "lead", l.created_at)
  }
  const bookings = await knex("bookings as b").join("leads as l", "l.id", "b.lead_id").whereNull("b.deleted_at").select("b.id", "l.phone", "b.created_at")
  for (const b of bookings) if (byPhone.has(b.phone)) await link(byPhone.get(b.phone), "booking", b.id, "customer", b.created_at)
  const dealers = await knex("dealers").whereNull("deleted_at").select("id", "name", "contact_name", "phone", "email", "city", "address", "created_at")
  for (const d of dealers) {
    const contactId =
      (d.phone && byPhone.get(d.phone)) ||
      (await create({
        kind: d.contact_name ? "person" : "company",
        name: d.contact_name || d.name,
        company: d.contact_name ? d.name : null,
        phone: d.phone,
        email: d.email,
        city: d.city,
        address: d.address,
        created_at: d.created_at,
      }))
    if (d.phone) byPhone.set(d.phone, contactId)
    await link(contactId, "dealer", d.id, "dealer", d.created_at)
  }
  await knex("sequences").where({ key: "contact" }).update({ next_value: next })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("contact_links")
  await knex.schema.dropTableIfExists("contacts")
  await knex("sequences").where({ key: "contact" }).delete()
}
