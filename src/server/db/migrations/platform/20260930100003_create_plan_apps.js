import { tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Apps included in each plan (join table: rows are removed, not soft-deleted)
  await knex.schema.createTable("plan_apps", (t) => {
    tableDefaults(t)
    t.bigInteger("plan_id").unsigned().notNullable()
    t.foreign("plan_id").references("plans.id").onDelete("RESTRICT")
    t.bigInteger("app_id").unsigned().notNullable()
    t.foreign("app_id").references("apps.id").onDelete("RESTRICT")
    t.primary(["plan_id", "app_id"])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("plan_apps")
}
