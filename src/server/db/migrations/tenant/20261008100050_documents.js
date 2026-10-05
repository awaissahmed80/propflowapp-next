import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// Documents app: company documents are assets with app "documents" and a document type
// (category = a document-type lookup value), plus what a document library needs: an expiry date
// (reminded 30 days before), a note, a project, versions (a newer file replaces the current one;
// earlier versions stay, superseded), and expiring share links with a log of every open.
export async function up(knex) {
  await knex.schema.alterTable("assets", (t) => {
    t.date("expires_on").nullable().index()
    datetime(t, "reminded_at").nullable() // the 30-day reminder went out
    t.string("note", 500).nullable()
    t.bigInteger("project_id").unsigned().nullable().index()
    t.integer("version").notNullable().defaultTo(1)
    t.bigInteger("replaces_id").unsigned().nullable() // the version this one replaced
    datetime(t, "superseded_at").nullable() // a newer version took its place
  })
  await knex.schema.createTable("share_links", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("token", 40).notNullable().unique() // in the public URL
    t.bigInteger("asset_id").unsigned().notNullable().index()
    t.string("note", 200).nullable() // who it's for: "Meezan Bank, mortgage team"
    datetime(t, "expires_at").notNullable()
    datetime(t, "revoked_at").nullable()
    externalId(t, "revoked_by").nullable()
    t.integer("views").notNullable().defaultTo(0)
    datetime(t, "last_viewed_at").nullable()
    timestamps(t, knex)
  })
  await knex.schema.createTable("share_link_views", (t) => {
    t.bigIncrements("id")
    t.bigInteger("link_id").unsigned().notNullable().index()
    datetime(t, "at").notNullable().defaultTo(knex.fn.now(3))
    t.string("ip_hash", 64).nullable() // hashed, never the address itself
    t.string("user_agent", 255).nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("share_link_views")
  await knex.schema.dropTableIfExists("share_links")
  await knex.schema.alterTable("assets", (t) => {
    for (const c of ["expires_on", "reminded_at", "note", "project_id", "version", "replaces_id", "superseded_at"]) t.dropColumn(c)
  })
}
