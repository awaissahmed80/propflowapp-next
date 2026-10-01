import { externalId, tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Apps a tenant has switched on (within its plan, or added)
  await knex.schema.createTable("tenant_apps", (t) => {
    tableDefaults(t)
    t.bigInteger("tenant_id").unsigned().notNullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    t.bigInteger("app_id").unsigned().notNullable()
    t.foreign("app_id").references("apps.id").onDelete("RESTRICT")
    t.primary(["tenant_id", "app_id"])
    t.datetime("enabled_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
    externalId(t, "enabled_by").nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("tenant_apps")
}
