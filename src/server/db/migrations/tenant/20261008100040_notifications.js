// Notifications: short updates for one person (the bell in the top bar). Apps add them for events
// people should hear about, e.g. a booking they sold got a payment, or one was handed to them.
export async function up(knex) {
  await knex.schema.createTable("notifications", (t) => {
    t.increments("id")
    t.integer("user_id").unsigned().notNullable()
    t.string("app", 30).notNullable()
    t.string("kind", 40).notNullable() // e.g. booking.receipt
    t.string("title", 200).notNullable()
    t.string("body", 500).nullable()
    t.string("href", 300).nullable() // where clicking it goes (codes, never ids)
    t.string("icon", 40).nullable()
    t.datetime("read_at", { precision: 3 }).nullable()
    t.integer("created_by").unsigned().nullable()
    t.datetime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
    t.index(["user_id", "read_at"])
    t.index(["user_id", "created_at"])
  })
}

export async function down(knex) {
  await knex.schema.dropTable("notifications")
}
