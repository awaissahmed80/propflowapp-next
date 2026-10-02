import { datetime, externalId } from "../../columns.js"

// Leads can be archived: out of the pipeline (list, board, due follow-ups) without being lost or
// deleted, and brought back whenever. Status, history and planned follow-ups are kept as they are.
export async function up(knex) {
  await knex.schema.alterTable("leads", (t) => {
    datetime(t, "archived_at").nullable().index()
    externalId(t, "archived_by").nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable("leads", (t) => {
    t.dropColumn("archived_at")
    t.dropColumn("archived_by")
  })
}
