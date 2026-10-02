import { datetime, externalId, tableDefaults, timestamps } from "../../columns.js"

// Lead assignment rules (CRM › Assignment rules): new leads with no agent picked go through the
// active rules in order; the first whose conditions match decides who gets it: one agent,
// round-robin within a team, or round-robin among chosen agents. last_assigned_id keeps each
// rule's place in its rotation. Nothing matches: the workspace's auto-assign setting applies.
//   conditions: { projects: [code], sources: [], cities: [], overseas: null | true | false,
//                 unitTypes: [], budgetMin, budgetMax }   (empty = any)
// leads.auto_reassigned_at: when the "not reached within X hours" check moved it (once only)
export async function up(knex) {
  await knex.schema.createTable("lead_assignment_rules", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("name", 120).notNullable()
    t.integer("sort_order").notNullable().defaultTo(0)
    t.boolean("is_active").notNullable().defaultTo(true)
    t.json("conditions").nullable()
    t.string("assign_to", 10).notNullable() // agent | team | agents
    externalId(t, "agent_id").nullable()
    t.bigInteger("team_id").unsigned().nullable()
    t.json("agent_ids").nullable()
    externalId(t, "last_assigned_id").nullable()
    timestamps(t, knex)
  })
  await knex.schema.alterTable("leads", (t) => {
    datetime(t, "auto_reassigned_at").nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("lead_assignment_rules")
  await knex.schema.alterTable("leads", (t) => {
    t.dropColumn("auto_reassigned_at")
  })
}
