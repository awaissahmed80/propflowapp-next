import { datetime, tableDefaults } from "../../columns.js"

// Lead sources that post their leads to PropFlow (Settings › Integrations): Google Ads lead forms
// (Google's webhook) and Google Forms (an Apps Script in the form). Each of their forms is linked to
// a PropFlow lead form (lead_forms.provider = the source), like Facebook forms, and every lead is
// logged first (unique per source) so it's added once and a failed one can be tried again.
export async function up(knex) {
  await knex.schema.alterTable("lead_forms", (t) => {
    t.string("provider", 20).nullable().alter() // null | meta | google-ads | google-forms
  })
  await knex.schema.createTable("external_forms", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("source", 20).notNullable() // google-ads | google-forms
    t.string("external_id", 120).notNullable() // the source's form id
    t.string("name", 200).notNullable()
    t.json("questions").nullable() // [{ key, label, type }] as last seen
    t.bigInteger("lead_form_id").unsigned().nullable().index()
    datetime(t, "last_lead_at").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
    datetime(t, "updated_at").nullable()
    t.unique(["source", "external_id"])
  })
  await knex.schema.createTable("external_leads", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("source", 20).notNullable()
    t.string("external_id", 120).notNullable() // the source's lead / response id
    t.string("form_external_id", 120).nullable().index()
    t.string("status", 12).notNullable().defaultTo("received").index() // received | created | duplicate | failed | paused
    t.bigInteger("lead_id").unsigned().nullable()
    t.json("field_data").nullable() // [{ name, values }]
    t.json("meta").nullable() // campaign / ad group ids, gclid…
    t.string("error", 300).nullable()
    t.integer("attempts").notNullable().defaultTo(0)
    t.boolean("is_test").notNullable().defaultTo(false)
    datetime(t, "received_at").notNullable().defaultTo(knex.fn.now(3))
    datetime(t, "processed_at").nullable()
    t.unique(["source", "external_id"])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("external_leads")
  await knex.schema.dropTableIfExists("external_forms")
}
