import { datetime, externalId, money, tableDefaults, timestamps } from "../../columns.js"

// CRM: leads and what happens with them (calls, WhatsApp, visits, meetings; done or planned).
// Status, source, temperature, loss reason and activity type are lookup values (lead-status…).
// The next follow-up is the earliest planned activity, not a column.
export async function up(knex) {
  await knex.schema.createTable("leads", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // LD-00001: in URLs (lowercased)
    t.string("name", 120).notNullable()
    t.string("phone", 20).notNullable().index() // +923001234567
    t.boolean("whatsapp").notNullable().defaultTo(true)
    t.string("email", 150).nullable()
    t.string("city", 80).nullable()
    t.boolean("overseas").notNullable().defaultTo(false)
    t.string("source", 40).nullable() // lead-source
    t.string("status", 40).notNullable().defaultTo("new").index() // lead-status
    t.string("priority", 20).notNullable().defaultTo("warm") // lead-priority
    t.string("loss_reason", 40).nullable() // loss-reason
    // What they're looking for
    t.bigInteger("project_id").unsigned().nullable().references("id").inTable("projects")
    t.string("unit_type", 40).nullable() // unit-type
    t.decimal("size_value", 10, 2).nullable()
    t.string("size_unit", 10).nullable() // marla | kanal | sqft
    money(t, "budget_min").nullable()
    money(t, "budget_max").nullable()
    t.string("payment_plan", 20).nullable() // installments | cash
    t.string("purpose", 20).nullable() // investment | living
    t.text("notes").nullable()
    // Who works it
    externalId(t, "assigned_to").nullable().index()
    t.bigInteger("team_id").unsigned().nullable()
    datetime(t, "first_contact_at").nullable()
    datetime(t, "last_contact_at").nullable()
    datetime(t, "closed_at").nullable() // booked or lost
    timestamps(t, knex)
  })
  await knex.schema.createTable("lead_activities", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("lead_id").unsigned().notNullable().references("id").inTable("leads")
    t.string("type", 40).notNullable() // activity-type, or "system" (status / assignment changes)
    t.string("status", 20).notNullable().defaultTo("done").index() // done | planned | missed
    datetime(t, "at").notNullable().index() // when it happened, or is due
    datetime(t, "done_at").nullable()
    externalId(t, "by").nullable() // who did it (or will)
    t.string("outcome", 60).nullable() // interested | no-answer | call-back | not-interested…
    t.text("notes").nullable()
    t.bigInteger("project_id").unsigned().nullable() // site visits
    timestamps(t, knex)
    t.index(["lead_id", "status"])
  })
  await knex("sequences").insert({ key: "lead", prefix: "LD", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("lead_activities")
  await knex.schema.dropTableIfExists("leads")
  await knex("sequences").where({ key: "lead" }).delete()
}
