import { uniqueAlive } from "../../columns.js"

// Sign in with Google: the Google account ("sub", Google's permanent user id) linked to a user.
// Set the first time they use Google; afterwards only that Google account can sign in as them.
export async function up(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("google_sub", 64).nullable().after("password_hash")
  })
  await uniqueAlive(knex, "users", "google_sub")
}

export async function down(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropUnique(["google_sub", "alive"], "users_google_sub_alive_unique")
    t.dropColumn("google_sub")
  })
}
