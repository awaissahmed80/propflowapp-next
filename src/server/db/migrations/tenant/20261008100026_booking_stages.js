// Bookings get their own pipeline stage (booking-stage: Token → Booking & KYC → Active →
// Handover → Completed) apart from their status (booking-status: Current, Overdue, On hold,
// Cancelled…). The lists' values are added by the lookups seed that runs after migrations.
export async function up(knex) {
  await knex.schema.alterTable("bookings", (t) => {
    t.string("stage", 40).notNullable().defaultTo("token").index().after("kind") // booking-stage
  })
  await knex("bookings").where({ kind: "booking" }).update({ stage: "booking-kyc" })
  await knex("bookings").where({ status: "active" }).update({ status: "current" })
  await knex.schema.alterTable("bookings", (t) => {
    t.string("status", 40).notNullable().defaultTo("current").alter() // booking-status
  })
}

export async function down(knex) {
  await knex("bookings").where({ status: "current" }).update({ status: "active" })
  await knex.schema.alterTable("bookings", (t) => {
    t.dropColumn("stage")
    t.string("status", 20).notNullable().defaultTo("active").alter()
  })
}
