import { datetime, externalId, money, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // A console user invites someone to set up a new workspace: the plan and terms are chosen
  // here, the invitee only fills in company details and their account. No payment at setup.
  await knex.schema.createTable("workspace_invitations", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("email", 190).notNullable().index()
    t.string("contact_name", 120).notNullable()
    t.string("phone", 20).nullable()
    t.string("company_name", 150).nullable() // suggestion; the invitee can change it
    t.bigInteger("plan_id").unsigned().notNullable()
    t.foreign("plan_id").references("plans.id").onDelete("RESTRICT")
    t.string("billing_cycle", 10).notNullable().defaultTo("monthly") // monthly | yearly
    t.string("start_as", 10).notNullable().defaultTo("trial") // trial | active
    t.integer("trial_days").nullable()
    money(t, "price").nullable() // agreed price per cycle; NULL = the plan's price
    t.string("note", 255).nullable() // internal
    externalId(t, "invited_by").notNullable() // pf_auth users.id
    t.string("token_hash", 64).notNullable().unique()
    datetime(t, "expires_at").notNullable()
    datetime(t, "accepted_at").nullable()
    t.bigInteger("tenant_id").unsigned().nullable()
    t.foreign("tenant_id").references("tenants.id").onDelete("RESTRICT")
    datetime(t, "revoked_at").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("workspace_invitations")
}
