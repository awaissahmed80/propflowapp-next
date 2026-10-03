import { datetime, externalId, money, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// Project Portfolio: projects (societies, towers, malls) with phases and blocks, and the units
// in them (plots, files, houses, apartments, shops, offices, farmhouses). Pick-list values
// (type, status, authority, feature…) are lookup values; see src/modules/lookups/catalog.js.
export async function up(knex) {
  await knex.schema.createTable("projects", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 6).notNullable() // SKE: in URLs (lowercased), unit codes and file numbers
    t.string("name", 150).notNullable()
    t.string("type", 40).notNullable() // project-type
    t.string("status", 40).notNullable() // project-status
    t.string("city", 80).nullable()
    t.string("location", 255).notNullable()
    t.string("authority", 40).nullable() // authority (LDA, CDA…)
    t.string("approval", 40).notNullable() // approval-status
    t.string("noc_number", 80).nullable() // NOC / LOP number, once approved
    t.date("launch_date").nullable()
    t.date("possession_date").nullable()
    t.decimal("total_area", 12, 2).notNullable()
    t.string("area_unit", 10).notNullable().defaultTo("kanal") // kanal | marla
    t.decimal("marla_sqft", 8, 2).notNullable().defaultTo(225) // 225 or 272.25
    t.string("color", 9).notNullable().defaultTo("#0270d2")
    t.text("description").nullable()
    t.json("amenities").nullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "projects", "code")

  // Phase 1, Tower A… Balloted phases have numbered plots in blocks; unballoted phases hold
  // open files in file pools until balloting.
  await knex.schema.createTable("project_phases", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.string("name", 80).notNullable()
    t.string("stage", 20).notNullable().defaultTo("balloted") // phase-stage
    t.string("status", 40).notNullable() // project-status
    t.date("launch_date").nullable()
    t.date("possession_date").nullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })

  // Block A, Commercial Boulevard, Floors 6–10, Open Files…
  await knex.schema.createTable("project_blocks", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.bigInteger("phase_id").unsigned().notNullable().index()
    t.string("name", 80).notNullable()
    t.string("category", 20).notNullable().defaultTo("residential") // block-category
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "project_blocks", ["phase_id", "name"])

  // One plot, file, house, apartment, shop, office or farmhouse
  await knex.schema.createTable("units", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 30).notNullable().unique() // SKE-0001: in URLs (lowercased)
    t.bigInteger("project_id").unsigned().notNullable().index()
    t.bigInteger("phase_id").unsigned().notNullable().index()
    t.bigInteger("block_id").unsigned().notNullable().index()
    t.string("number", 40).notNullable() // plot no., file no. SKE-F-1001, shop C-1, flat 101
    t.string("type", 40).notNullable().index() // unit-type
    t.string("category", 20).notNullable() // residential | commercial (from the block)
    t.decimal("size_value", 10, 2).notNullable()
    t.string("size_unit", 10).notNullable() // marla | kanal | sqft
    t.integer("area_sqft").notNullable()
    t.string("street", 60).nullable()
    t.string("dimensions", 20).nullable() // 25×45 (ft)
    t.integer("floor").nullable() // 0 = ground
    t.integer("bedrooms").nullable()
    t.json("features").nullable() // feature values: corner, park-facing…
    t.json("premiums").nullable() // [{ feature, percent }] as applied to the price
    money(t, "base_price").notNullable()
    money(t, "price").notNullable() // base + premiums, rounded to Rs 1,000
    t.string("status", 20).notNullable().defaultTo("available").index() // unit-status
    t.bigInteger("dealer_id").unsigned().nullable().index() // in this dealer's quota
    externalId(t, "hold_by").nullable() // pf_auth users.id
    t.string("hold_reason", 60).nullable() // hold-reason
    datetime(t, "hold_expires_at").nullable().index()
    t.string("block_reason", 255).nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "units", ["block_id", "number"])
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("units")
  await knex.schema.dropTableIfExists("project_blocks")
  await knex.schema.dropTableIfExists("project_phases")
  await knex.schema.dropTableIfExists("projects")
}
