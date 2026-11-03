// The leads list reads the newest live leads first: index that order instead of sorting the table
export async function up(knex) {
  await knex.schema.alterTable("leads", (t) => t.index(["deleted_at", "created_at"], "leads_live_created_idx"))
}

export async function down(knex) {
  await knex.schema.alterTable("leads", (t) => t.dropIndex(["deleted_at", "created_at"], "leads_live_created_idx"))
}
