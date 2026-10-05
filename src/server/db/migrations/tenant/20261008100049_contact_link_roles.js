// Contact types set by hand: a contact added straight into Contacts (an owner, a vendor) has no
// lead or booking to take its types from, so each type is a link to the contact itself
// (linkable_type "contact", linkable_id = the contact's id, role = the type). One contact can have
// several, so the role joins the unique key.
export async function up(knex) {
  await knex.schema.alterTable("contact_links", (t) => {
    t.dropUnique([], "contact_links_contact_id_linkable_type_linkable_id_alive_unique")
    t.unique(["contact_id", "linkable_type", "linkable_id", "role", "alive"], { indexName: "contact_links_contact_link_role_alive_unique" })
  })
}

export async function down(knex) {
  await knex.schema.alterTable("contact_links", (t) => {
    t.dropUnique([], "contact_links_contact_link_role_alive_unique")
    t.unique(["contact_id", "linkable_type", "linkable_id", "alive"], { indexName: "contact_links_contact_id_linkable_type_linkable_id_alive_unique" })
  })
}
