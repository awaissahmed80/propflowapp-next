import { code, datetime, money, tableDefaults, timestamps } from "../../columns.js"

// Bookings made when a lead is closed as won with a unit (CRM › Close deal), and the payment
// schedule agreed for them. The Sales app builds on these.
export async function up(knex) {
  await knex.schema.createTable("bookings", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 20) // BK-2026-000001
    t.bigInteger("lead_id").unsigned().nullable().index().references("id").inTable("leads")
    t.bigInteger("unit_id").unsigned().notNullable().index().references("id").inTable("units")
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.string("customer_name", 120).notNullable()
    t.string("customer_phone", 20).nullable()
    t.string("kind", 20).notNullable().defaultTo("booking") // token | booking
    money(t, "agreed_price").notNullable()
    money(t, "token_amount").nullable()
    t.string("schedule", 20).notNullable() // pending (set up in Sales) | single | installments
    t.integer("installments").notNullable().defaultTo(1)
    t.date("first_due_date").notNullable()
    t.string("status", 20).notNullable().defaultTo("active").index() // active | cancelled
    t.text("notes").nullable()
    datetime(t, "booked_at").notNullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("booking_installments", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("booking_id").unsigned().notNullable().index().references("id").inTable("bookings")
    t.integer("number").notNullable() // 1, 2, 3…
    t.date("due_date").notNullable()
    money(t, "amount").notNullable()
    t.string("status", 20).notNullable().defaultTo("due") // due | paid
    timestamps(t, knex)
  })
  await knex("sequences").insert({ key: "booking", prefix: "BK", format: "{PREFIX}-{YYYY}-{SEQ}", padding: 6, reset: "yearly", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("booking_installments")
  await knex.schema.dropTableIfExists("bookings")
  await knex("sequences").where({ key: "booking" }).delete()
}
