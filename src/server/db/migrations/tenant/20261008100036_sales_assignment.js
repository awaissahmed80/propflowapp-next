import { externalId, tableDefaults, timestamps } from "../../columns.js"

// Sales assignment rules: when a booking reaches a stage (e.g. Active), and matches the
// conditions, it's given to someone: one agent, a team taking turns, or chosen agents taking turns.
// Checked in order; the first that matches wins. bookings.agent_id is who handles it now.
//   conditions: { projects: [code], kinds: [token | booking] }   (empty = any)
export async function up(knex) {
  await knex.schema.createTable("sales_assignment_rules", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("name", 120).notNullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    t.boolean("is_active").notNullable().defaultTo(true)
    t.string("stage", 40).notNullable() // booking-stage it applies on reaching
    t.json("conditions").nullable()
    t.string("assign_to", 10).notNullable() // agent | team | agents
    externalId(t, "agent_id").nullable()
    t.bigInteger("team_id").unsigned().nullable()
    t.json("agent_ids").nullable()
    externalId(t, "last_assigned_id").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("sales_assignment_rules")
}
