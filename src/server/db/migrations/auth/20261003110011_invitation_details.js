// Workspace invitations also carry where the person goes once they join:
// { teamId, designation, department } in the workspace's own database
export async function up(knex) {
  await knex.schema.alterTable("invitations", (t) => {
    t.json("details").nullable().after("console_role")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("invitations", (t) => {
    t.dropColumn("details")
  })
}
