import { datetime, money, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Plan history of each tenant
  await knex.schema.createTable("subscriptions", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("tenant_id").unsigned().notNullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    t.bigInteger("plan_id").unsigned().notNullable()
    t.foreign("plan_id").references("plans.id").onDelete("RESTRICT")
    t.string("billing_cycle", 10).notNullable() // monthly | yearly
    money(t, "price").notNullable() // per cycle, before tax
    t.integer("extra_users").notNullable().defaultTo(0)
    datetime(t, "starts_at").notNullable()
    datetime(t, "ends_at").nullable()
    t.string("status", 20).notNullable().defaultTo("active").index() // active | ended | cancelled
    t.string("note", 255).nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("subscriptions")
}
