import { datetime, externalId, tableDefaults } from "../../columns.js"

// Dashboards app: each person's own arrangement of a dashboard (which cards are hidden, and the
// order). One row per person and dashboard; no row means the default layout (Reset deletes it).
//   layout: { order: ["exec-bookings", …], hidden: ["exec-payroll", …] }
export async function up(knex) {
  await knex.schema.createTable("dashboard_layouts", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "user_id").notNullable()
    t.string("dashboard", 30).notNullable() // executive | sales | finance | inventory | after-sales | people
    t.json("layout").notNullable()
    datetime(t, "updated_at").notNullable().defaultTo(knex.fn.now(3))
    t.unique(["user_id", "dashboard"])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("dashboard_layouts")
}
