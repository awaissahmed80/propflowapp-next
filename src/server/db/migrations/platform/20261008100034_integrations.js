import { datetime, externalId, tableDefaults } from "../../columns.js"

// Integrations, platform-wide (Live / Coming soon / Hidden, set in the console) and per workspace
// (switched off by PropFlow staff). No row for a workspace: it follows the platform setting.
const SEED = [
  ["meta", "live"],
  ["whatsapp", "soon"],
  ["google-leads", "soon"],
  ["sms", "soon"],
]

export async function up(knex) {
  await knex.schema.createTable("integrations", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("key", 30).notNullable().unique()
    t.string("status", 10).notNullable().defaultTo("soon") // live | soon | hidden
    datetime(t, "updated_at").nullable()
    externalId(t, "updated_by").nullable()
  })
  await knex.schema.createTable("tenant_integrations", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "tenant_id").notNullable()
    t.string("key", 30).notNullable()
    t.boolean("enabled").notNullable().defaultTo(true)
    t.string("note", 300).nullable() // why it was switched off
    datetime(t, "updated_at").nullable()
    externalId(t, "updated_by").nullable()
    t.unique(["tenant_id", "key"])
  })
  await knex("integrations").insert(SEED.map(([key, status]) => ({ key, status })))
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("tenant_integrations")
  await knex.schema.dropTableIfExists("integrations")
}
