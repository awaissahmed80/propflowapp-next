import { datetime, externalId, money, tableDefaults } from "../../columns.js"

// Every SMS the workspace sends through its own SMS gateway account (Settings › Integrations ›
// SMS gateway): who it went to, the text, how many parts it cost, the provider's id and charge,
// and its delivery report. subject_type / subject_id: the record it was about (booking, lead…).
export async function up(knex) {
  await knex.schema.createTable("sms_messages", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("to_phone", 20).notNullable().index()
    t.text("body").notNullable()
    t.integer("parts").notNullable().defaultTo(1)
    t.boolean("unicode").notNullable().defaultTo(false) // Urdu and other non-GSM text
    t.string("kind", 15).notNullable().defaultTo("transactional") // transactional | promotional | test
    t.string("provider", 20).notNullable()
    t.string("provider_message_id", 60).nullable().index()
    t.string("status", 12).notNullable().defaultTo("queued").index() // queued | sent | delivered | failed
    t.string("error_code", 40).nullable()
    t.string("error", 300).nullable()
    money(t, "cost").nullable() // as the provider charged it
    t.string("network", 40).nullable()
    t.string("subject_type", 30).nullable()
    t.bigInteger("subject_id").unsigned().nullable()
    externalId(t, "sent_by").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
    datetime(t, "sent_at").nullable()
    datetime(t, "delivered_at").nullable()
    t.index(["subject_type", "subject_id"])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sms_messages")
}
