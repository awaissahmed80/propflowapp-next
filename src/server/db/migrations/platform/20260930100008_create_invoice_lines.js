import { money, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  await knex.schema.createTable("invoice_lines", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("invoice_id").unsigned().notNullable()
    t.foreign("invoice_id").references("invoices.id").onDelete("RESTRICT")
    t.string("description", 255).notNullable()
    t.decimal("quantity", 10, 2).notNullable().defaultTo(1)
    money(t, "unit_price").notNullable()
    money(t, "amount").notNullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("invoice_lines")
}
