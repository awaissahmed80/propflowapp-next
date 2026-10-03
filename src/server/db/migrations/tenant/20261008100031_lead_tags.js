import { externalId, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

// People tagged on a lead: they see it (and work it, as their role allows) besides whoever it's
// assigned to. The assignee (or someone who can reassign leads) tags teammates; untagging soft-deletes.
export async function up(knex) {
  await knex.schema.createTable("lead_tags", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.bigInteger("lead_id").unsigned().notNullable().index()
    externalId(t, "user_id").notNullable().index()
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "lead_tags", ["lead_id", "user_id"])
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("lead_tags")
}
