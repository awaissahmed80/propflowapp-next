import { datetime, externalId, tableDefaults } from "../../columns.js"

// Facebook Pages connected for lead ads, by workspace. Meta sends every lead to one webhook
// address; this says which workspace a Page's leads belong to. A Page feeds one workspace.
export async function up(knex) {
  await knex.schema.createTable("meta_pages", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("page_id", 40).notNullable().unique() // Facebook's Page id
    externalId(t, "tenant_id").notNullable().index()
    datetime(t, "connected_at").notNullable().defaultTo(knex.fn.now(3))
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("meta_pages")
}
