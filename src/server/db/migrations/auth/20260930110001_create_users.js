import { datetime, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // One account per person across every workspace; which workspaces is in memberships
  await knex.schema.createTable("users", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("name", 120).notNullable()
    t.string("email", 190).notNullable() // stored lowercased
    t.string("phone", 20).nullable().index() // +92 format
    t.string("password_hash", 255).nullable() // NULL until an invited person sets one
    t.boolean("must_change_password").notNullable().defaultTo(false)
    t.string("status", 20).notNullable().defaultTo("active").index() // active | disabled
    datetime(t, "email_verified_at").nullable()
    datetime(t, "phone_verified_at").nullable()
    datetime(t, "password_changed_at").nullable()
    datetime(t, "last_login_at").nullable()
    // Brute-force protection
    t.integer("failed_attempts").notNullable().defaultTo(0)
    datetime(t, "locked_until").nullable()
    t.string("avatar_url", 255).nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "users", "email")
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("users")
}
