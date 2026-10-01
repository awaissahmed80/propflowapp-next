import { code, money, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  await knex.schema.createTable("plans", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 30) // starter, growth…
    t.string("name", 60).notNullable()
    t.string("description", 255).nullable()
    money(t, "price_monthly").notNullable()
    t.string("currency", 3).notNullable().defaultTo("PKR")
    // Limits; NULL means unlimited
    t.integer("max_projects").nullable()
    t.integer("max_users").nullable()
    t.integer("max_dealers").nullable()
    t.boolean("is_public").notNullable().defaultTo(true)
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("plans")
}
