import { datetime } from "../../columns.js"

// A note printed on the invoice, and why/when an invoice was voided (invoices are never deleted,
// so the numbering has no gaps)
export async function up(knex) {
  await knex.schema.alterTable("invoices", (t) => {
    t.text("notes").nullable().after("status")
    datetime(t, "voided_at").nullable().after("paid_at")
    t.string("void_reason", 255).nullable().after("voided_at")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("invoices", (t) => {
    t.dropColumn("notes")
    t.dropColumn("voided_at")
    t.dropColumn("void_reason")
  })
}
