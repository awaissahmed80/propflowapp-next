import { externalId, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Conversation on a support request. Append-only: corrections are new messages
  await knex.schema.createTable("support_messages", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("request_id").unsigned().notNullable()
    t.foreign("request_id").references("support_requests.id").onDelete("RESTRICT")
    externalId(t, "author_id").notNullable()
    t.string("author_side", 10).notNullable() // tenant | platform
    t.text("body").notNullable()
    t.boolean("is_internal").notNullable().defaultTo(false) // staff-only note
    timestamps(t, knex, { softDelete: false, audit: false })
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("support_messages")
}
