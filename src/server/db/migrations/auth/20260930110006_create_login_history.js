import { datetime, externalId, tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Every sign-in attempt, successful or not. Append-only.
  await knex.schema.createTable("login_history", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "user_id").nullable().index()
    t.string("email", 190).nullable()
    t.boolean("success").notNullable()
    t.string("reason", 30).nullable() // ok | bad-password | locked | disabled | unknown-email
    externalId(t, "tenant_id").nullable()
    t.string("ip", 45).nullable()
    t.string("user_agent", 255).nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3)).index()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("login_history")
}
