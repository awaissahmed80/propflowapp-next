import { datetime, externalId, tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Console staff signing in as a workspace user. A record of what happened: never deleted
  await knex.schema.createTable("impersonations", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "staff_user_id").notNullable()
    t.bigInteger("tenant_id").unsigned().notNullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    externalId(t, "target_user_id").notNullable()
    t.string("reason", 255).notNullable()
    datetime(t, "started_at").notNullable().defaultTo(knex.fn.now(3))
    datetime(t, "ended_at").nullable()
    t.string("ip", 45).nullable()
    t.string("user_agent", 255).nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("impersonations")
}
