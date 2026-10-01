import { datetime, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// A project's development progress (roads 80%, electricity 60%…), its updates timeline and its
// events (launch, balloting, possession ceremony…). Update photos are assets (owner_type
// "project_update"). Codes are random, for URLs and actions; never row ids in URLs.
export async function up(knex) {
  // % complete per development work item, overall or for one phase
  await knex.schema.createTable("project_progress", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.bigInteger("phase_id").unsigned().nullable().index() // null: the whole project
    t.string("work", 60).notNullable() // development-work lookup
    t.integer("percent").notNullable().defaultTo(0)
    t.string("note", 255).nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "project_progress", ["project_id", "phase_id", "work"])

  // Timeline: construction progress, approvals, balloting news, announcements
  await knex.schema.createTable("project_updates", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 24).notNullable().unique()
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.bigInteger("phase_id").unsigned().nullable()
    t.string("type", 60).notNullable() // update-type lookup
    t.string("title", 200).notNullable()
    t.text("body").nullable()
    t.json("changes").nullable() // progress changes this update records: [{ work, from, to }]
    datetime(t, "posted_at").notNullable().index()
    timestamps(t, knex)
  })

  // Launches, balloting draws, possession ceremonies, expos, site visits
  await knex.schema.createTable("project_events", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 24).notNullable().unique()
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.string("type", 60).notNullable() // event-type lookup
    t.string("title", 200).notNullable()
    datetime(t, "starts_at").notNullable().index()
    datetime(t, "ends_at").nullable()
    t.string("venue", 255).nullable()
    t.text("description").nullable()
    t.string("status", 20).notNullable().defaultTo("scheduled") // scheduled | held | cancelled
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("project_events")
  await knex.schema.dropTableIfExists("project_updates")
  await knex.schema.dropTableIfExists("project_progress")
}
