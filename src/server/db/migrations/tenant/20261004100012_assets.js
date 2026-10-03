import { externalId, tableDefaults, timestamps } from "../../columns.js"

// Every file in the workspace, in one place: project photos and documents, unit photos, booking
// documents, contact CNIC scans… attached to any record (owner_type + owner_id). Virtual folders
// (asset_folders) organize them for the Documents app. Files live in storage; each asset has a
// random code for its URL, never the row id.
export async function up(knex) {
  await knex.schema.dropTableIfExists("project_files")

  await knex.schema.createTable("asset_folders", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 24).notNullable().unique()
    t.bigInteger("parent_id").unsigned().nullable().index()
    t.string("name", 120).notNullable()
    t.string("app", 30).nullable() // whose folder (estate, sales…); null = Documents app
    t.string("owner_type", 40).nullable() // a record's own folder, e.g. project
    externalId(t, "owner_id").nullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
    t.index(["owner_type", "owner_id"])
  })

  await knex.schema.createTable("assets", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 24).notNullable().unique() // random, in URLs
    t.string("app", 30).notNullable().index() // estate, sales, contacts, documents… (access follows the app)
    t.string("owner_type", 40).nullable() // project, unit, booking, contact… (null: loose in a folder)
    externalId(t, "owner_id").nullable()
    t.bigInteger("folder_id").unsigned().nullable().index()
    t.string("collection", 30).notNullable() // images | documents | …
    t.string("category", 60).nullable() // a lookup value, e.g. project-document-type
    t.string("title", 150).notNullable()
    t.string("file_key", 255).notNullable()
    t.string("file_name", 255).notNullable()
    t.string("mime", 80).notNullable()
    t.integer("size").unsigned().notNullable()
    t.boolean("is_cover").notNullable().defaultTo(false) // the featured image of its owner
    t.boolean("is_private").notNullable().defaultTo(false) // only people who can edit in the app
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
    t.index(["owner_type", "owner_id", "collection"])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("assets")
  await knex.schema.dropTableIfExists("asset_folders")
}
