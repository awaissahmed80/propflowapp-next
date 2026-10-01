import { externalId, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // Console team: pf_auth users with a console role
  await knex.schema.createTable("platform_staff", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "user_id").notNullable()
    t.string("role", 20).notNullable() // owner | admin | finance | support
    t.boolean("is_active").notNullable().defaultTo(true)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "platform_staff", "user_id")
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("platform_staff")
}
