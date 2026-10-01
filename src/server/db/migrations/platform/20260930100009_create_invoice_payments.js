import { datetime, externalId, money, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Payments against invoices: JazzCash, Easypaisa, bank transfer or card
  await knex.schema.createTable("invoice_payments", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("invoice_id").unsigned().notNullable()
    t.foreign("invoice_id").references("invoices.id").onDelete("RESTRICT")
    t.string("method", 20).notNullable() // jazzcash | easypaisa | bank-transfer | card
    money(t, "amount").notNullable()
    t.string("reference", 120).nullable() // gateway transaction id or bank reference
    // pending | confirmed | failed | refunded
    t.string("status", 20).notNullable().defaultTo("pending").index()
    datetime(t, "paid_at").nullable()
    externalId(t, "verified_by").nullable() // staff who confirmed a bank transfer
    t.json("gateway_response").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("invoice_payments")
}
