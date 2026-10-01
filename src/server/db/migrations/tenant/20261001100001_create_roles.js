import { tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // Workspace roles. pf_auth memberships.role_id points here. System roles (Owner) come from
  // the default seeds and can't be deleted; the workspace adds its own later.
  await knex.schema.createTable("roles", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 40).notNullable() // owner, admin, sales-agent…
    t.string("name", 80).notNullable()
    t.string("description", 255).nullable()
    t.json("permissions").notNullable() // ["*"] or ["crm.leads.view", …]
    t.boolean("is_system").notNullable().defaultTo(false)
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "roles", "code")
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("roles")
}
