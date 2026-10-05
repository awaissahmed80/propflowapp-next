import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// Facebook & Instagram lead ads (Campaigns › Integrations): the Facebook account that connected
// the workspace, its Pages (tokens sealed with ENCRYPTION_KEY), the Page's lead forms (each one
// linked to a PropFlow lead form, so leads take the same road as website entries) and a log of
// every lead Meta sent, so none is lost and failures can be retried.
export async function up(knex) {
  await knex.schema.createTable("meta_connections", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("fb_user_id", 40).notNullable()
    t.string("fb_user_name", 150).nullable()
    t.text("user_token").notNullable() // sealed, long-lived (about 60 days)
    datetime(t, "token_expires_at").nullable()
    timestamps(t, knex, { softDelete: false })
  })
  await knex.schema.createTable("meta_pages", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("page_id", 40).notNullable().unique()
    t.string("name", 150).notNullable()
    t.string("picture_url", 500).nullable()
    t.text("page_token").notNullable() // sealed
    datetime(t, "subscribed_at").nullable() // receiving leads
    t.string("last_error", 300).nullable()
    timestamps(t, knex, { softDelete: false })
  })
  await knex.schema.createTable("meta_forms", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("form_id", 40).notNullable().unique()
    t.string("page_id", 40).notNullable().index()
    t.string("name", 200).notNullable()
    t.string("fb_status", 20).nullable() // ACTIVE | ARCHIVED…
    t.json("questions").nullable() // [{ key, label, type, options }]
    t.bigInteger("lead_form_id").unsigned().nullable().index() // the PropFlow form leads go through
    datetime(t, "last_lead_at").nullable()
    datetime(t, "synced_at").nullable() // last "fetch missed leads"
    timestamps(t, knex, { softDelete: false })
  })
  await knex.schema.createTable("meta_leads", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("leadgen_id", 40).notNullable().unique()
    t.string("page_id", 40).nullable()
    t.string("form_id", 40).nullable().index()
    t.string("platform", 10).nullable() // fb | ig
    t.string("status", 12).notNullable().defaultTo("received").index() // received | created | duplicate | failed | paused
    t.bigInteger("lead_id").unsigned().nullable()
    t.json("field_data").nullable()
    t.string("error", 300).nullable()
    t.integer("attempts").notNullable().defaultTo(0)
    t.boolean("is_test").notNullable().defaultTo(false)
    datetime(t, "created_time").nullable() // when the person sent it on Facebook
    datetime(t, "received_at").notNullable().defaultTo(knex.fn.now(3))
    datetime(t, "processed_at").nullable()
  })
  // Lead forms that belong to a lead ad provider aren't public pages
  await knex.schema.alterTable("lead_forms", (t) => {
    t.string("provider", 10).nullable() // null: PropFlow form · meta: a Facebook lead form
  })
  await knex.schema.alterTable("leads", (t) => {
    externalId(t, "meta_lead_id").nullable() // meta_leads.id it came from
  })
}

export async function down(knex) {
  await knex.schema.alterTable("leads", (t) => t.dropColumn("meta_lead_id"))
  await knex.schema.alterTable("lead_forms", (t) => t.dropColumn("provider"))
  for (const t of ["meta_leads", "meta_forms", "meta_pages", "meta_connections"]) await knex.schema.dropTableIfExists(t)
}
