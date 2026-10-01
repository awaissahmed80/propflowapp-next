import { code, datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Requests raised from workspaces (Help & feedback)
  await knex.schema.createTable("support_requests", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 20) // REQ-26-0031
    t.bigInteger("tenant_id").unsigned().notNullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    externalId(t, "raised_by").notNullable()
    t.string("subject", 200).notNullable()
    t.string("category", 20).notNullable() // problem | feature | question | billing
    t.string("priority", 10).notNullable().defaultTo("normal") // normal | urgent
    // open | waiting | resolved | closed
    t.string("status", 20).notNullable().defaultTo("open").index()
    externalId(t, "assigned_to").nullable()
    datetime(t, "resolved_at").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("support_requests")
}
