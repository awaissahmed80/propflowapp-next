import { datetime, externalId, percent, tableDefaults, timestamps } from "../../columns.js"

// Price lists: versioned per project (draft → active → archived; one active per project).
// A list is one document, so its parts are JSON:
//   rates     [{ key, type, category, sizeValue|null (any size), sizeUnit|null, rate }]  rate per marla, or per sq ft
//   premiums  [{ feature, percent }]
//   charges   [{ key, name, basis: fixed|per-marla|per-sqft|percent, amount, due }]
//   plans     [{ key, name, downPaymentPct, installments, frequency, balloonCount, balloonPct, possessionPct, discountPct, note }]
// Bookings keep their own copy of the plan, so a list can be archived without touching them.
export async function up(knex) {
  await knex.schema.createTable("price_lists", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 12).notNullable().unique() // PL-0001: in URLs (lowercased)
    t.bigInteger("project_id").unsigned().notNullable().references("id").inTable("projects")
    t.integer("version").notNullable()
    t.string("name", 150).notNullable()
    t.string("status", 20).notNullable().defaultTo("draft") // draft | active | archived
    t.date("effective_from").notNullable()
    t.text("notes").nullable() // printed on the list
    percent(t, "floor_rise_pct").notNullable().defaultTo(0) // per floor above ground (towers)
    t.json("rates").notNullable()
    t.json("premiums").notNullable()
    t.json("charges").notNullable()
    t.json("plans").notNullable()
    externalId(t, "activated_by").nullable()
    datetime(t, "activated_at").nullable()
    timestamps(t, knex)
    t.index(["project_id", "status"])
  })
  await knex("sequences").insert({ key: "price-list", prefix: "PL", format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("price_lists")
  await knex("sequences").where({ key: "price-list" }).delete()
}
