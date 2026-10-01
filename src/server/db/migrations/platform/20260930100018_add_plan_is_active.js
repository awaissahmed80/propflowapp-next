// Plans can be switched off: no new signups or plan changes onto them, while workspaces already
// on the plan keep it. (is_public only hides a plan from the website; it can still be assigned.)
export async function up(knex) {
  await knex.schema.alterTable("plans", (t) => {
    t.boolean("is_active").notNullable().defaultTo(true).after("is_public")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("plans", (t) => {
    t.dropColumn("is_active")
  })
}
