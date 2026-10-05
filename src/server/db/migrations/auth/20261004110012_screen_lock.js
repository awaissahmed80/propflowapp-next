import { datetime } from "../../columns.js"

// Screen lock: a quick privacy screen over the portal. The person's settings live on their
// account (same in every workspace and browser); the lock itself is on the session row, so
// reloading the page doesn't get past it.
export async function up(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("lock_passcode_hash", 255).nullable().after("locked_until") // argon2id, like passwords
    t.tinyint("lock_passcode_length").unsigned().nullable().after("lock_passcode_hash") // 4 | 6
    t.smallint("auto_lock_minutes").unsigned().notNullable().defaultTo(0).after("lock_passcode_length") // 0 = off
  })
  await knex.schema.alterTable("sessions", (t) => {
    datetime(t, "locked_at").nullable().after("last_seen_at")
    t.tinyint("unlock_attempts").unsigned().notNullable().defaultTo(0).after("locked_at")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("sessions", (t) => {
    t.dropColumn("unlock_attempts")
    t.dropColumn("locked_at")
  })
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("auto_lock_minutes")
    t.dropColumn("lock_passcode_length")
    t.dropColumn("lock_passcode_hash")
  })
}
