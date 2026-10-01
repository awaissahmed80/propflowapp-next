import { datetime, externalId, money, tableDefaults, timestamps } from "../../columns.js"

// Approvals: one inbox (My Desk › Requests & approvals) for anything a person asks someone with
// more rights to do: activate a price list now; extra discounts, cancellations, payments and
// transfers as their apps arrive. The title, details, amount and link are kept as they were
// when asked, so the inbox reads without loading every app's records.
export async function up(knex) {
  await knex.schema.createTable("approvals", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // APR-00001
    t.string("type", 40).notNullable() // price-list | discount | cancellation | payment | transfer…
    t.string("app", 20).notNullable() // estate, sales…
    t.string("status", 20).notNullable().defaultTo("pending").index() // pending | approved | rejected | withdrawn
    t.string("subject_type", 40).notNullable()
    t.bigInteger("subject_id").unsigned().notNullable()
    t.string("title", 200).notNullable()
    t.string("details", 255).nullable()
    money(t, "amount").nullable()
    t.string("link", 255).nullable() // portal path to the record
    t.text("reason").nullable() // from the person asking
    t.json("payload").nullable() // what approving does, e.g. { apply: true }
    externalId(t, "requested_by").notNullable()
    externalId(t, "decided_by").nullable()
    datetime(t, "decided_at").nullable()
    t.text("decision_note").nullable() // why it was rejected (the requester sees it)
    timestamps(t, knex)
    t.index(["subject_type", "subject_id"])
  })
  await knex("sequences").insert({ key: "approval", prefix: "APR", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("approvals")
  await knex("sequences").where({ key: "approval" }).delete()
}
