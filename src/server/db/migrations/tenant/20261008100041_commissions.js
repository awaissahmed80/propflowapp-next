// Commissions: a booking earns its dealer (or, without one, the agent who sold it) a % of the net
// price, payable once the trigger in Sales settings is met. Payouts pay one partner for one or
// more bookings, with income tax withheld on dealers (section 233). Each dealer can have their
// own agreed rate.
const money = (t, name) => t.decimal(name, 15, 2)

export async function up(knex) {
  await knex.schema.alterTable("dealers", (t) => {
    t.decimal("commission_pct", 5, 2).nullable().after("ntn") // agreed rate; empty: the Sales default
  })
  await knex.schema.createTable("commission_payouts", (t) => {
    t.bigIncrements("id")
    t.string("code", 30).notNullable().unique() // PO-2026-00001
    t.string("partner_type", 10).notNullable() // dealer | agent
    t.bigInteger("dealer_id").unsigned().nullable().index()
    t.integer("user_id").unsigned().nullable().index()
    t.date("paid_on").notNullable()
    t.string("method", 40).notNullable() // payment-method lookup value
    t.bigInteger("account_id").unsigned().nullable() // paid from (cash / bank)
    t.string("reference", 120).nullable()
    money(t, "gross").notNullable()
    t.decimal("wht_pct", 5, 2).notNullable().defaultTo(0)
    money(t, "wht").notNullable().defaultTo(0)
    money(t, "net").notNullable()
    t.string("notes", 500).nullable()
    t.integer("created_by").unsigned().nullable()
    t.datetime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
    t.integer("updated_by").unsigned().nullable()
    t.datetime("updated_at", { precision: 3 }).nullable()
    t.integer("deleted_by").unsigned().nullable()
    t.datetime("deleted_at", { precision: 3 }).nullable()
  })
  await knex.schema.createTable("commission_payout_items", (t) => {
    t.bigIncrements("id")
    t.bigInteger("payout_id").unsigned().notNullable().index()
    t.bigInteger("booking_id").unsigned().notNullable().index()
    money(t, "amount").notNullable()
    t.decimal("pct", 5, 2).notNullable()
    t.datetime("recovered_at", { precision: 3 }).nullable() // clawback collected after a cancellation
    t.integer("recovered_by").unsigned().nullable()
  })
  await knex("sequences").insert({ key: "commission-payout", prefix: "PO", format: "{PREFIX}-{YYYY}-{SEQ}", padding: 5, reset: "yearly", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("commission_payout_items")
  await knex.schema.dropTableIfExists("commission_payouts")
  await knex("sequences").where({ key: "commission-payout" }).delete()
  await knex.schema.alterTable("dealers", (t) => {
    t.dropColumn("commission_pct")
  })
}
