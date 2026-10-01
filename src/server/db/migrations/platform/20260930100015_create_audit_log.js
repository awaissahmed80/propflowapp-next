import { datetime, externalId, tableDefaults } from "../../columns.js"

export async function up(knex) {
  // Console actions: append-only
  await knex.schema.createTable("audit_log", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "actor_user_id").nullable()
    t.string("action", 60).notNullable().index() // tenant.suspended, plan.changed…
    t.string("subject_type", 40).nullable()
    externalId(t, "subject_id").nullable()
    externalId(t, "tenant_id").nullable().index()
    t.json("details").nullable()
    t.string("ip", 45).nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3)).index()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("audit_log")
}
