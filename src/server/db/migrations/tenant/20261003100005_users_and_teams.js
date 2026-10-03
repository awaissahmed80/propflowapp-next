import { datetime, externalId, money, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// Users & Teams. Who belongs to the workspace and their role is in pf_auth.memberships; the
// workspace keeps everything else about them here.
export async function up(knex) {
  // Roles also limit which records people see in an app (scope: { crm: "own" | "team" | "all" })
  // and what they may do inside it (grants: { "operations.discount": 5, "operations.cancel": true })
  await knex.schema.alterTable("roles", (t) => {
    t.json("scope").nullable().after("permissions")
    t.json("grants").nullable().after("scope")
  })

  // Sales teams: a lead, members (members.team_id) and a monthly target
  await knex.schema.createTable("teams", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("name", 80).notNullable()
    t.string("color", 12).notNullable().defaultTo("blue")
    t.string("description", 255).nullable()
    externalId(t, "lead_user_id").nullable() // pf_auth users.id
    t.integer("target_bookings").notNullable().defaultTo(0)
    money(t, "target_value").notNullable().defaultTo(0)
    t.json("project_ids").nullable() // projects they sell, once Project Portfolio is here
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "teams", "name")

  // A person's profile in this workspace: team, designation and department (lookups)
  await knex.schema.createTable("members", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    externalId(t, "user_id").notNullable() // pf_auth users.id
    t.bigInteger("team_id").unsigned().nullable().index()
    t.string("designation", 60).nullable()
    t.string("department", 60).nullable()
    datetime(t, "joined_at").nullable()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "members", "user_id")

  // What people did in the workspace: sign-ins, access changes, invitations, teams…
  // Append-only. summary reads after the person's name: "invited Ali Raza as Sales Agent".
  await knex.schema.createTable("activity_log", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("type", 20).notNullable().index() // sign-in | security | role | invite | team | lists | export…
    t.string("action", 40).notNullable() // member.role_changed, team.created…
    externalId(t, "actor_user_id").nullable().index()
    t.string("summary", 500).notNullable()
    t.string("subject_type", 30).nullable()
    externalId(t, "subject_id").nullable()
    t.json("details").nullable()
    t.string("ip", 45).nullable()
    datetime(t, "created_at").notNullable().defaultTo(knex.fn.now(3)).index()
  })

  // Pick-list values (designations, departments, statuses…). The lists themselves are defined in
  // code (src/modules/lookups/catalog.js); the workspace can relabel, recolor, reorder and, on
  // custom lists, add and switch off values.
  await knex.schema.createTable("lookups", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("list_key", 40).notNullable().index()
    t.string("value", 60).notNullable()
    t.string("label", 120).notNullable()
    t.string("color", 12).nullable()
    t.string("icon", 40).nullable()
    t.json("meta").nullable()
    t.boolean("is_default").notNullable().defaultTo(false) // came with PropFlow: can be switched off, not deleted
    t.boolean("is_active").notNullable().defaultTo(true)
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "lookups", ["list_key", "value"])
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("lookups")
  await knex.schema.dropTableIfExists("activity_log")
  await knex.schema.dropTableIfExists("members")
  await knex.schema.dropTableIfExists("teams")
  await knex.schema.alterTable("roles", (t) => {
    t.dropColumn("grants")
    t.dropColumn("scope")
  })
}
