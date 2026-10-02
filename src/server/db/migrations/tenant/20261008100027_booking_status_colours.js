// Booking statuses first went out with two colours outside the palette: use palette ones
export async function up(knex) {
  await knex("lookups").where({ list_key: "booking-status", value: "on-hold", color: "slate" }).update({ color: "gray" })
  await knex("lookups").where({ list_key: "booking-status", value: "refunded", color: "rose" }).update({ color: "teal" })
}

export async function down() {
  // Nothing to undo
}
