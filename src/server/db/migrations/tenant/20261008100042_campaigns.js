import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// Campaigns: launches, booking drives, expos… with channels (lead sources) and their budget and
// spend, and goals. Lead forms (embeddable; each entry becomes a CRM lead) and landing pages
// (sections built in the app, published on campaigns.<domain>/<workspace>/<slug>).
// Results (leads, visits, bookings, cost per lead) are worked out from CRM leads, never stored.
export async function up(knex) {
  await knex.schema.createTable("campaigns", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // CMP-0001
    t.string("name", 150).notNullable()
    t.string("objective", 40).nullable() // campaign-objective
    t.bigInteger("project_id").unsigned().nullable().index()
    t.string("status", 20).notNullable().defaultTo("draft").index() // campaign-status
    t.date("start_date").nullable()
    t.date("end_date").nullable()
    externalId(t, "owner_id").nullable()
    t.string("audience", 500).nullable()
    t.string("offer", 500).nullable()
    t.text("notes").nullable()
    t.json("channels").nullable() // [{ channel (lead-source), budget, spend, impressions, clicks }]
    t.json("goals").nullable() // [{ metric: leads | site-visits | bookings | cpl, target }]
    timestamps(t, knex)
  })
  await knex.schema.createTable("lead_forms", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // FRM-0001
    t.string("name", 150).notNullable()
    t.bigInteger("campaign_id").unsigned().nullable().index()
    t.bigInteger("project_id").unsigned().nullable()
    t.string("status", 20).notNullable().defaultTo("active") // active | paused
    t.json("fields").nullable() // [{ id, type, label, required, placeholder, options, mapTo }]
    t.json("settings").nullable() // { title, intro, submitLabel, successMessage, whatsapp, redirectUrl, accent, channel, assignTo }
    t.integer("views").unsigned().notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await knex.schema.createTable("landing_pages", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // LP-0001
    t.string("name", 150).notNullable()
    t.string("slug", 120).notNullable().index() // unique among live pages (checked on save)
    t.string("template", 40).nullable()
    t.bigInteger("campaign_id").unsigned().nullable().index()
    t.bigInteger("project_id").unsigned().nullable()
    t.bigInteger("form_id").unsigned().nullable()
    t.string("status", 20).notNullable().defaultTo("draft") // draft | published
    t.json("theme").nullable() // { accent, font, radius, buttons }
    t.json("seo").nullable() // { title, description, image }
    t.json("sections").nullable() // [{ id, type, variant, enabled, style: {…}, …props }]
    t.integer("views").unsigned().notNullable().defaultTo(0)
    datetime(t, "published_at").nullable()
    timestamps(t, knex)
  })
  await knex.schema.alterTable("leads", (t) => {
    t.bigInteger("campaign_id").unsigned().nullable().index()
    t.bigInteger("form_id").unsigned().nullable()
    t.bigInteger("landing_page_id").unsigned().nullable()
  })
  for (const [key, prefix] of [
    ["campaign", "CMP"],
    ["lead-form", "FRM"],
    ["landing-page", "LP"],
  ])
    await knex("sequences").insert({ key, prefix, format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.alterTable("leads", (t) => {
    t.dropColumn("campaign_id")
    t.dropColumn("form_id")
    t.dropColumn("landing_page_id")
  })
  await knex.schema.dropTableIfExists("landing_pages")
  await knex.schema.dropTableIfExists("lead_forms")
  await knex.schema.dropTableIfExists("campaigns")
  await knex("sequences").whereIn("key", ["campaign", "lead-form", "landing-page"]).delete()
}
