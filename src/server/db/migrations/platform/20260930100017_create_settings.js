import { tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Platform-wide values: trial length, yearly discount, sales tax, extra-user price
  await knex.schema.createTable("settings", (t) => {
    tableDefaults(t)
    t.string("key", 60).primary()
    t.json("value").notNullable()
    t.string("description", 255).nullable()
    t.datetime("updated_at", { precision: 3 }).nullable()
    t.bigInteger("updated_by").unsigned().nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("settings")
}
