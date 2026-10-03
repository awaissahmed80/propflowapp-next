// Who sold a booking (the agent who closed it; never changes, commission and credit follow it),
// apart from who handles it now (agent_id, handed on by Sales › Customize › Assignment rules)
export async function up(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.integer("sold_by").unsigned().nullable().after("agent_id").index()
  })
  await knex.raw("UPDATE bookings SET sold_by = COALESCE(agent_id, created_by) WHERE sold_by IS NULL")
}

export async function down(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.dropColumn("sold_by")
  })
}
