// Where a code was requested from, so one address can't flood mailboxes with codes
export async function up(knex) {
  await knex.schema.alterTable("one_time_codes", (t) => {
    t.string("ip", 45).nullable().after("consumed_at").index()
  })
}

export async function down(knex) {
  await knex.schema.alterTable("one_time_codes", (t) => {
    t.dropIndex(["ip"])
    t.dropColumn("ip")
  })
}
