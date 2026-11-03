import { datetime, externalId, tableDefaults } from "../../columns.js"

// Changes sent from the mobile app, each with the opId the phone made for it: a phone that sends
// the same change again (it lost the answer on a bad connection) gets the first answer back
// instead of the change being made twice.
export async function up(knex) {
  await knex.schema.createTable("sync_ops", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("op_id", 36).notNullable().unique()
    externalId(t, "session_id").nullable()
    externalId(t, "user_id").notNullable()
    t.string("kind", 40).notNullable() // e.g. leads.activity
    t.json("result").nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3)).index()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sync_ops")
}
