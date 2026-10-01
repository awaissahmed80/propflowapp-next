// Photo links from Google and file storage can be longer than 255 characters
export async function up(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("avatar_url", 500).nullable().alter()
  })
}

export async function down(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.string("avatar_url", 255).nullable().alter()
  })
}
