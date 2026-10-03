// Receipts record when money was received to the minute (date and time), not just the day
export async function up(knex) {
  await knex.raw("ALTER TABLE receipts MODIFY received_on DATETIME(3) NOT NULL")
}

export async function down(knex) {
  await knex.raw("ALTER TABLE receipts MODIFY received_on DATE NOT NULL")
}
