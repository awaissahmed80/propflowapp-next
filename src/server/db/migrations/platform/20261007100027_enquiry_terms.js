// When someone creating a workspace from the website accepted the Terms & Conditions and
// Privacy Policy (and which version)
export async function up(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.datetime("terms_accepted_at", { precision: 3 }).nullable().after("interests")
    t.string("terms_version", 20).nullable().after("terms_accepted_at")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.dropColumn("terms_accepted_at")
    t.dropColumn("terms_version")
  })
}
