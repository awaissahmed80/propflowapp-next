// Custom quote requests from the website (when prices are hidden): what kind of business asked,
// and the setting that switches the quote wizard on.
export async function up(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.string("business_type", 30).nullable().after("kind") // developer | builder | agency | marketing | investor | other
  })
  await knex("settings")
    .insert({ key: "quote_requests", value: JSON.stringify(true), description: "When prices are hidden, invite visitors to describe their business and needs for a custom quote" })
    .onConflict("key")
    .ignore()
}

export async function down(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.dropColumn("business_type")
  })
  await knex("settings").where({ key: "quote_requests" }).delete()
}
