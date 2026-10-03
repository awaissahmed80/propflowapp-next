import { datetime, externalId, money, percent, tableDefaults, timestamps } from "../../columns.js"

// Finance: double-entry vouchers (manual ones, and those the other apps post: bookings, receipts,
// cheques, cancellations, commission payouts, service fees), vendors with income tax withholding,
// and payment requests (invoices) to buyers.
//   vouchers.status: pending (waiting in Approvals) | posted | rejected | void
//   vouchers.source: manual | booking | receipt | cheque | cancellation | refund | commission | fee | payroll
export async function up(knex) {
  await knex.schema.createTable("vouchers", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 30).notNullable().unique() // BRV-2627-00001
    t.string("type", 4).notNullable().index() // jv | crv | cpv | brv | bpv
    t.string("status", 12).notNullable().defaultTo("posted").index()
    datetime(t, "voucher_date").notNullable().index()
    t.string("narration", 500).notNullable()
    money(t, "amount").notNullable().defaultTo(0) // total of the debits, for lists
    t.string("party", 150).nullable() // paid to / received from
    t.string("reference", 120).nullable()
    t.string("cheque_no", 40).nullable()
    t.bigInteger("project_id").unsigned().nullable().index() // null: head office
    t.bigInteger("vendor_id").unsigned().nullable().index()
    t.string("source", 20).notNullable().defaultTo("manual").index()
    t.string("source_type", 30).nullable() // booking | receipt | commission_payout | service_request…
    t.bigInteger("source_id").unsigned().nullable()
    t.string("source_code", 40).nullable() // the record's human code, for links
    t.string("event", 30).nullable() // what happened to the source: sale, received, cleared, bounced…
    t.bigInteger("reversal_of").unsigned().nullable()
    externalId(t, "approved_by").nullable()
    datetime(t, "approved_at").nullable()
    externalId(t, "voided_by").nullable()
    datetime(t, "voided_at").nullable()
    t.string("void_reason", 300).nullable()
    timestamps(t, knex)
    t.index(["source_type", "source_id"])
  })
  await knex.schema.createTable("voucher_lines", (t) => {
    t.bigIncrements("id")
    t.bigInteger("voucher_id").unsigned().notNullable().index()
    t.bigInteger("account_id").unsigned().notNullable().index()
    money(t, "debit").notNullable().defaultTo(0)
    money(t, "credit").notNullable().defaultTo(0)
    t.string("memo", 255).nullable()
    t.integer("sort_order").notNullable().defaultTo(0)
  })
  await knex.schema.createTable("vendors", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable().unique() // VND-00001
    t.string("name", 150).notNullable()
    t.string("category", 30).nullable() // vendor-category lookup
    t.bigInteger("account_id").unsigned().nullable() // usually charged to (expense account)
    percent(t, "wht_pct").notNullable().defaultTo(0) // income tax withheld on payments
    t.string("ntn", 20).nullable()
    t.string("cnic", 15).nullable()
    t.string("phone", 20).nullable()
    t.string("email", 150).nullable()
    t.string("address", 300).nullable()
    t.string("bank_name", 100).nullable()
    t.string("account_title", 150).nullable()
    t.string("account_number", 40).nullable()
    t.boolean("is_active").notNullable().defaultTo(true)
    t.string("notes", 500).nullable()
    timestamps(t, knex)
  })
  // Payment requests to buyers: installments due and fees, printable with bank details
  await knex.schema.createTable("payment_requests", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 30).notNullable().unique() // INV-2627-00001
    t.bigInteger("booking_id").unsigned().nullable().index()
    t.bigInteger("contact_id").unsigned().nullable().index()
    t.bigInteger("service_request_id").unsigned().nullable().index()
    t.string("status", 12).notNullable().defaultTo("issued").index() // issued | paid | cancelled
    datetime(t, "issued_on").notNullable()
    datetime(t, "due_on").notNullable().index()
    t.json("lines").notNullable() // [{ label, amount, installmentId?, kind }]
    money(t, "total").notNullable()
    t.bigInteger("account_id").unsigned().nullable() // pay into (bank details printed)
    t.string("notes", 500).nullable()
    datetime(t, "paid_at").nullable()
    datetime(t, "cancelled_at").nullable()
    timestamps(t, knex)
  })
  for (const [key, prefix] of [
    ["voucher-jv", "JV"],
    ["voucher-crv", "CRV"],
    ["voucher-cpv", "CPV"],
    ["voucher-brv", "BRV"],
    ["voucher-bpv", "BPV"],
    ["payment-request", "INV"],
  ])
    await knex("sequences").insert({ key, prefix, format: "{PREFIX}-{FY}-{SEQ}", padding: 5, reset: "fiscal", next_value: 1 }).onConflict("key").ignore()
  await knex("sequences").insert({ key: "vendor", prefix: "VND", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  for (const t of ["payment_requests", "vendors", "voucher_lines", "vouchers"]) await knex.schema.dropTableIfExists(t)
  await knex("sequences").whereIn("key", ["voucher-jv", "voucher-crv", "voucher-cpv", "voucher-brv", "voucher-bpv", "payment-request", "vendor"]).delete()
}
