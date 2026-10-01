import { externalId, datetime, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // Which workspaces a user belongs to, and their role there. The role itself (name and
  // permissions) lives in the tenant's own database.
  await knex.schema.createTable("memberships", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("user_id").unsigned().notNullable()
    t.foreign("user_id").references("users.id").onDelete("RESTRICT")
    externalId(t, "tenant_id").notNullable().index() // pf_platform tenants.id
    externalId(t, "role_id").notNullable() // roles.id in the tenant database
    t.string("status", 20).notNullable().defaultTo("active").index() // invited | active | suspended
    t.boolean("is_default").notNullable().defaultTo(false) // workspace opened after sign-in
    datetime(t, "joined_at").nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "memberships", ["user_id", "tenant_id"])
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("memberships")
}
