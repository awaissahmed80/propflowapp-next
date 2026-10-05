import { datetime, externalId, tableDefaults } from "../../columns.js"

// Import & export: a log of every import (who, what, how many, and the rows that failed, so they
// can be fixed and imported again), and leads keep the id they had in the CRM they came from
// (import_ref), so their history can be imported against them.
export async function up(knex) {
  await knex.schema.createTable("data_imports", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("entity", 20).notNullable().index() // leads | activities | contacts | units | employees
    t.string("file_name", 200).nullable()
    t.string("mode", 10).notNullable() // skip | update
    t.json("options").nullable() // e.g. how leads were assigned
    t.integer("total").notNullable().defaultTo(0)
    t.integer("created").notNullable().defaultTo(0)
    t.integer("updated").notNullable().defaultTo(0)
    t.integer("skipped").notNullable().defaultTo(0)
    t.integer("failed").notNullable().defaultTo(0)
    t.json("errors").nullable() // [{ row, label, errors }] (first 1000)
    externalId(t, "created_by").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
  })
  await knex.schema.alterTable("leads", (t) => {
    t.string("import_ref", 60).nullable().index() // the lead's id in the CRM it was imported from
  })
}

export async function down(knex) {
  await knex.schema.alterTable("leads", (t) => t.dropColumn("import_ref"))
  await knex.schema.dropTableIfExists("data_imports")
}
