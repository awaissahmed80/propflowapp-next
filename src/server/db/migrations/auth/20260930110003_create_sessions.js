import { externalId, datetime, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // Signed-in browsers. The cookie holds a random token; only its SHA-256 is kept here, so the
  // table can't be used to sign in. Revoking a row signs that browser out at once.
  await knex.schema.createTable("sessions", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("token_hash", 64).notNullable().unique()
    t.bigInteger("user_id").unsigned().notNullable()
    t.foreign("user_id").references("users.id").onDelete("RESTRICT")
    t.string("kind", 10).notNullable().defaultTo("tenant") // tenant | console
    externalId(t, "tenant_id").nullable() // active workspace
    // Console staff signed in as this user (impersonation)
    externalId(t, "impersonator_user_id").nullable()
    externalId(t, "impersonation_id").nullable() // pf_platform impersonations.id
    t.string("ip", 45).nullable()
    t.string("user_agent", 255).nullable()
    datetime(t, "last_seen_at").nullable()
    datetime(t, "expires_at").notNullable().index()
    datetime(t, "revoked_at").nullable()
    timestamps(t, knex, { softDelete: false, audit: false })
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sessions")
}
