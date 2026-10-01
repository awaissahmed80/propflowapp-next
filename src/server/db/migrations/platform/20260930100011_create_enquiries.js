import { code, externalId, tableDefaults, timestamps } from "../../columns.js"

export async function up(knex) {
  // "Talk to sales" from the website
  await knex.schema.createTable("enquiries", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    code(t, 20) // ENQ-26-0031
    t.string("name", 120).notNullable()
    t.string("company", 150).nullable()
    t.string("email", 150).nullable()
    t.string("phone", 20).nullable()
    t.string("city", 60).nullable()
    t.string("projects", 40).nullable() // how many projects they run, as told
    t.text("message").nullable()
    t.string("source", 40).nullable() // home, pricing, demo-request…
    // new | contacted | demo | won | lost
    t.string("status", 20).notNullable().defaultTo("new").index()
    externalId(t, "assigned_to").nullable()
    t.text("notes").nullable()
    timestamps(t, knex)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("enquiries")
}
