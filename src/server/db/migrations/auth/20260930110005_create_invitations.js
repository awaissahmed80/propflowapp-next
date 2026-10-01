import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Invitations to join a workspace. The link carries a random token; only its hash is kept.
  await knex.schema.createTable("invitations", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("email", 190).notNullable().index()
    t.string("name", 120).nullable()
    externalId(t, "tenant_id").notNullable().index()
    externalId(t, "role_id").notNullable()
    externalId(t, "invited_by").notNullable()
    t.string("token_hash", 64).notNullable().unique()
    datetime(t, "expires_at").notNullable()
    datetime(t, "accepted_at").nullable()
    externalId(t, "accepted_user_id").nullable()
    datetime(t, "revoked_at").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("invitations")
}
