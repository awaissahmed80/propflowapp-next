// A booking activity can point at files already in the booking's folder (picked in the file
// manager), not just ones uploaded with it: their asset ids, as a JSON array
export async function up(knex) {
  await knex.schema.alterTable("booking_activities", (t) => {
    t.json("attachments").nullable().after("notes")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("booking_activities", (t) => {
    t.dropColumn("attachments")
  })
}
