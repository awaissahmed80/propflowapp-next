import { datetime, externalId, tableDefaults } from "../../columns.js"

export async function up(knex) {
  // 6-digit codes by email: sign-up, email verification, password reset, screen unlock.
  // Stored as an HMAC, used once, few attempts allowed.
  await knex.schema.createTable("one_time_codes", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "user_id").nullable().index() // NULL during sign-up, before the account exists
    t.string("email", 190).nullable().index()
    t.string("purpose", 20).notNullable() // signup | verify-email | reset-password | unlock
    t.string("code_hash", 64).notNullable()
    t.integer("attempts").notNullable().defaultTo(0)
    datetime(t, "expires_at").notNullable()
    datetime(t, "consumed_at").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3))
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("one_time_codes")
}
