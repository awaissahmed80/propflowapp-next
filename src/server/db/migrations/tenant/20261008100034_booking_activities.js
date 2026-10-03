import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// A booking's timeline: what Sales did (system: plan set, payment recorded, cheque bounced,
// allotment, handover, cancelled…) and what people logged (a note, call, WhatsApp, meeting…),
// with files attached as assets (owner_type booking-activity). type: system or an activity-type value.
export async function up(knex) {
  await knex.schema.createTable("booking_activities", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("booking_id").unsigned().notNullable().index()
    t.string("type", 40).notNullable().defaultTo("note") // system | note | call | whatsapp | meeting | …
    t.string("event", 40).nullable() // for system rows: plan | kyc | receipt | cleared | bounced | allotted | handover | completed | hold | cancelled | created
    t.text("notes").nullable()
    externalId(t, "by").nullable()
    datetime(t, "at").notNullable().index()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("booking_activities")
}
