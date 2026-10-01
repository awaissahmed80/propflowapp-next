import { tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// External dealers (estate agencies) who sell the developer's inventory. Managed in
// Users & Teams › Dealer Accounts for now; the Sales app uses the same table. A dealer firm's
// logins are members with dealer_id set, and see only their own firm's work.
export async function up(knex) {
  await knex.schema.createTable("dealers", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 30).notNullable().unique() // DLR-0001
    t.string("name", 150).notNullable()
    t.string("contact_name", 120).nullable()
    t.string("phone", 20).nullable() // +92 format
    t.string("email", 190).nullable()
    t.string("city", 80).nullable()
    t.string("address", 255).nullable()
    t.string("ntn", 20).nullable()
    t.string("notes", 500).nullable()
    t.boolean("is_active").notNullable().defaultTo(true)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "dealers", "name")

  await knex.schema.alterTable("members", (t) => {
    t.bigInteger("dealer_id").unsigned().nullable().index().after("team_id")
  })

  await knex("sequences").insert({ key: "dealer", prefix: "DLR", format: "{PREFIX}-{SEQ}", padding: 4, reset: "never", next_value: 1 }).onConflict("key").ignore()
}

export async function down(knex) {
  await knex.schema.alterTable("members", (t) => {
    t.dropColumn("dealer_id")
  })
  await knex.schema.dropTableIfExists("dealers")
  await knex("sequences").where({ key: "dealer" }).delete()
}
