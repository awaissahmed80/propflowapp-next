// Invitations can also bring people onto the PropFlow console team: kind = "console" with a
// console role, and no workspace or workspace role.
export async function up(knex) {
  await knex.schema.alterTable("invitations", (t) => {
    t.string("kind", 10).notNullable().defaultTo("tenant").after("id").index() // tenant | console
    t.string("console_role", 20).nullable().after("role_id") // admin | finance | sales | support
    t.bigInteger("tenant_id").unsigned().nullable().alter()
    t.bigInteger("role_id").unsigned().nullable().alter()
  })
}

export async function down(knex) {
  await knex("invitations").where({ kind: "console" }).delete()
  await knex.schema.alterTable("invitations", (t) => {
    t.dropColumn("kind")
    t.dropColumn("console_role")
    t.bigInteger("tenant_id").unsigned().notNullable().alter()
    t.bigInteger("role_id").unsigned().notNullable().alter()
  })
}
