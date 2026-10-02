// When a booking's token is due; the balance schedule starts a month after it
export async function up(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.date("token_due_date").nullable().after("token_amount")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.dropColumn("token_due_date")
  })
}
