import { code, datetime, externalId, money, percent, tableDefaults, timestamps } from "../../columns.js"

// Sales: bookings get their buyer, price, plan and people; the schedule lines know what they are
// and how much is paid; receipts are real records (cheques clear or bounce). A booking's own copy
// of the plan is kept so price lists can change without touching it.
//   bookings.plan        { key, name, downPaymentPct, installments, frequency, balloonCount, balloonPct, possessionPct, discountPct }
//   bookings.nominee     { name, relation, cnic }
//   installments.kind    token | down | installment | balloon | possession | full
// Paid amounts on lines are worked out from cleared receipts, oldest line first (see sales/server/ledger.js).
export async function up(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.bigInteger("contact_id").unsigned().nullable().index() // the buyer (central contacts)
    t.bigInteger("price_list_id").unsigned().nullable()
    t.json("plan").nullable()
    t.date("plan_start").nullable()
    money(t, "list_price").nullable() // the unit's price when booked
    money(t, "plan_discount").notNullable().defaultTo(0)
    money(t, "extra_discount").notNullable().defaultTo(0)
    money(t, "net_price").nullable() // what the buyer pays: agreed price less discounts
    externalId(t, "agent_id").nullable().index() // the sales agent
    t.bigInteger("dealer_id").unsigned().nullable().index()
    percent(t, "commission_pct").nullable()
    t.json("nominee").nullable()
    datetime(t, "kyc_at").nullable()
    t.string("allotment_no", 20).nullable()
    datetime(t, "allotted_at").nullable()
    externalId(t, "allotted_by").nullable()
    datetime(t, "handover_at").nullable()
    datetime(t, "completed_at").nullable()
    datetime(t, "cancelled_at").nullable()
    externalId(t, "cancelled_by").nullable()
    t.string("cancel_reason", 500).nullable()
    percent(t, "deduction_pct").nullable()
    money(t, "refund_amount").nullable()
  })
  await knex("bookings").update({ status: "current" }).whereIn("status", ["active"])
  await knex.raw("UPDATE bookings SET net_price = agreed_price WHERE net_price IS NULL")

  await knex.schema.alterTable("booking_installments", (t) => {
    t.string("kind", 20).notNullable().defaultTo("installment")
    t.string("label", 80).nullable()
    money(t, "paid_amount").notNullable().defaultTo(0)
  })
  await knex("booking_installments").where({ number: 0 }).update({ kind: "token", label: "Token" })
  await knex.raw("UPDATE booking_installments SET status = 'due' WHERE status NOT IN ('due', 'paid')")

  await knex.schema.alterTable("contacts", (t) => {
    t.string("guardian_relation", 4).nullable() // S/O, D/O, W/O
    t.string("guardian_name", 150).nullable()
  })

  await knex.schema.createTable("receipts", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 20) // RCP-2026-000001
    t.bigInteger("booking_id").unsigned().notNullable().index()
    t.date("received_on").notNullable()
    money(t, "amount").notNullable()
    t.string("method", 40).notNullable() // payment-method
    t.bigInteger("account_id").unsigned().nullable() // cash or bank account it went into
    t.string("reference", 120).nullable() // transaction id, pay order no., receipt book no.
    t.string("cheque_no", 30).nullable()
    t.string("cheque_bank", 80).nullable()
    t.date("cheque_date").nullable()
    t.string("status", 20).notNullable().defaultTo("cleared").index() // cleared | clearing | bounced | cancelled
    t.string("notes", 500).nullable()
    datetime(t, "cleared_at").nullable()
    datetime(t, "bounced_at").nullable()
    externalId(t, "status_by").nullable()
    timestamps(t, knex)
  })

  for (const [key, prefix] of [
    ["receipt", "RCP"],
    ["allotment", "AL"],
  ])
    await knex("sequences").insert({ key, prefix, format: "{PREFIX}-{YYYY}-{SEQ}", padding: 5, reset: "yearly", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("receipts")
  await knex("sequences").whereIn("key", ["receipt", "allotment"]).delete()
  await knex.schema.alterTable("contacts", (t) => {
    t.dropColumn("guardian_relation")
    t.dropColumn("guardian_name")
  })
  await knex.schema.alterTable("booking_installments", (t) => {
    t.dropColumn("kind")
    t.dropColumn("label")
    t.dropColumn("paid_amount")
  })
  await knex.schema.alterTable("bookings", (t) => {
    for (const c of [
      "contact_id",
      "price_list_id",
      "plan",
      "plan_start",
      "list_price",
      "plan_discount",
      "extra_discount",
      "net_price",
      "agent_id",
      "dealer_id",
      "commission_pct",
      "nominee",
      "kyc_at",
      "allotment_no",
      "allotted_at",
      "allotted_by",
      "handover_at",
      "completed_at",
      "cancelled_at",
      "cancelled_by",
      "cancel_reason",
      "deduction_pct",
      "refund_amount",
    ])
      t.dropColumn(c)
  })
}
