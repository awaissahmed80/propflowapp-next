import { code, datetime, externalId, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // Subscribers. Each has its own database: pf_ + lowercased code (pf_ten00042)
  await knex.schema.createTable("tenants", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 20) // TEN00042, permanent
    t.string("slug", 60).notNullable() // workspace address; can change, unique among live rows
    t.string("name", 150).notNullable()
    t.string("legal_name", 150).nullable()
    t.string("ntn", 20).nullable()
    t.string("city", 60).nullable()
    t.string("address", 255).nullable()
    t.string("phone", 20).nullable()
    t.string("email", 150).nullable()
    externalId(t, "owner_user_id").nullable() // pf_auth users.id
    t.bigInteger("plan_id").unsigned().notNullable()
    t.foreign("plan_id").references("plans.id").onDelete("RESTRICT")
    t.string("billing_cycle", 10).notNullable().defaultTo("monthly") // monthly | yearly
    // provisioning | trial | active | past_due | suspended | closed
    t.string("status", 20).notNullable().defaultTo("provisioning").index()
    datetime(t, "trial_ends_at").nullable()
    datetime(t, "current_period_ends_at").nullable()
    datetime(t, "suspended_at").nullable()
    t.string("suspended_reason", 255).nullable()
    // Where the tenant's data lives
    t.string("db_name", 64).notNullable().unique()
    t.string("db_host", 150).nullable() // NULL = the default DB_HOST
    t.string("schema_version", 40).nullable()
    t.string("seed_version", 40).nullable()
    datetime(t, "provisioned_at").nullable()
    t.text("provisioning_error").nullable()
    t.string("currency", 3).notNullable().defaultTo("PKR")
    t.string("timezone", 40).notNullable().defaultTo("Asia/Karachi")
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "tenants", "slug")
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("tenants")
}
