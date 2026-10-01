import { code, datetime, money, percent, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  await knex.schema.createTable("invoices", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 30) // INV-2026-00012
    t.bigInteger("tenant_id").unsigned().notNullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    t.bigInteger("subscription_id").unsigned().nullable()
    t.foreign("subscription_id").references("subscriptions.id").onDelete("RESTRICT")
    t.date("period_start").nullable()
    t.date("period_end").nullable()
    money(t, "subtotal").notNullable().defaultTo(0)
    percent(t, "tax_rate").notNullable().defaultTo(0)
    money(t, "tax").notNullable().defaultTo(0)
    money(t, "total").notNullable().defaultTo(0)
    t.string("currency", 3).notNullable().defaultTo("PKR")
    // draft | issued | paid | overdue | void
    t.string("status", 20).notNullable().defaultTo("draft").index()
    datetime(t, "issued_at").nullable()
    datetime(t, "due_at").nullable()
    datetime(t, "paid_at").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("invoices")
}
