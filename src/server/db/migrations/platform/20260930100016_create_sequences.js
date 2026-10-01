import { tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Numbering for human codes (TEN00042, INV-2026-00012). Taken with SELECT … FOR UPDATE
  await knex.schema.createTable("sequences", (t) => {
    tableDefaults(t)
    t.string("key", 60).primary() // tenant, invoice, enquiry…
    t.string("prefix", 20).notNullable()
    // Tokens: {PREFIX} {YYYY} {YY} {FY} {SEQ}
    t.string("format", 60).notNullable()
    t.integer("padding").notNullable().defaultTo(5)
    t.bigInteger("next_value").unsigned().notNullable().defaultTo(1)
    t.string("reset", 10).notNullable().defaultTo("never") // never | yearly | fiscal
    t.string("period", 10).nullable() // the year or financial year the counter belongs to
    t.datetime("updated_at", { precision: 3 }).nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sequences")
}
