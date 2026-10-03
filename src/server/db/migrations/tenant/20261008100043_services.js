import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// Estate Management (Care): requests from buyers and residents (transfers, NDCs, possession,
// documents, record updates, complaints), each with a checklist, a fee and a timeline. One
// table for every type; the type's own details sit in `data`.
export async function up(knex) {
  await knex.schema.createTable("service_requests", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // SR-00001
    t.string("type", 20).notNullable().index() // service-request-type
    t.string("status", 20).notNullable().defaultTo("new").index() // service-status
    t.string("priority", 10).notNullable().defaultTo("normal") // service-priority (complaints)
    t.string("channel", 20).nullable() // service-channel
    t.bigInteger("booking_id").unsigned().nullable().index()
    t.bigInteger("unit_id").unsigned().nullable()
    t.bigInteger("contact_id").unsigned().nullable().index()
    t.string("subject", 200).notNullable()
    t.text("details").nullable()
    externalId(t, "assigned_to").nullable().index()
    t.json("steps").nullable() // ticked checklist steps: ["application", "documents"]
    t.json("fee").nullable() // { amount, paidAt, method, ref, waived, reason, by }
    t.json("data").nullable() // the type's own details (transfer parties, NDC purpose…)
    t.text("resolution").nullable()
    datetime(t, "due_at").nullable().index()
    datetime(t, "closed_at").nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("service_request_events", (t) => {
    t.bigIncrements("id")
    t.bigInteger("request_id").unsigned().notNullable().index()
    t.string("kind", 20).notNullable() // customer | note | system
    t.text("text").notNullable()
    externalId(t, "by").nullable()
    datetime(t, "at").notNullable()
  })
  for (const [key, prefix, format, padding, reset] of [
    ["service-request", "SR", "{PREFIX}-{SEQ}", 5, "never"],
    ["ndc", "NDC", "{PREFIX}-{YYYY}-{SEQ}", 5, "yearly"],
    ["possession-letter", "PL", "{PREFIX}-{YYYY}-{SEQ}", 5, "yearly"],
    ["transfer-letter", "TL", "{PREFIX}-{YYYY}-{SEQ}", 5, "yearly"],
  ])
    await knex("sequences").insert({ key, prefix, format, padding, reset, next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("service_request_events")
  await knex.schema.dropTableIfExists("service_requests")
  await knex("sequences").whereIn("key", ["service-request", "ndc", "possession-letter", "transfer-letter"]).delete()
}
