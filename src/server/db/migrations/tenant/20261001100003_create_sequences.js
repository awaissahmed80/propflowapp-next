import { tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Numbering for the workspace's own codes (leads, bookings, receipts…); see numbering.js
  await knex.schema.createTable("sequences", (t) => {
    tableDefaults(t)
    t.string("key", 60).primary()
    t.string("prefix", 20).notNullable()
    t.string("format", 60).notNullable()
    t.integer("padding").notNullable().defaultTo(5)
    t.bigInteger("next_value").unsigned().notNullable().defaultTo(1)
    t.string("reset", 10).notNullable().defaultTo("never") // never | yearly | fiscal
    t.string("period", 10).nullable()
    t.datetime("updated_at", { precision: 3 }).nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sequences")
}
