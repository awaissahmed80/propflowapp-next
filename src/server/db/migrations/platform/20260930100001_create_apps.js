import { code, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // App catalog shown in the launcher and on plans
  await knex.schema.createTable("apps", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 30) // estate, crm, sales…
    t.string("name", 80).notNullable()
    t.string("description", 255).nullable()
    t.string("icon", 60).nullable()
    t.string("color", 20).nullable()
    t.string("category", 60).nullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    // Every workspace has it, whatever the plan (My Desk)
    t.boolean("always_on").notNullable().defaultTo(false)
    t.boolean("is_active").notNullable().defaultTo(true)
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("apps")
}
