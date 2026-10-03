// Payments get a human code (PAY-2026-00001) so links to them never carry the row id.
// Existing payments are numbered in the order they were made.
export async function up(knex) {
  await knex.schema.alterTable("invoice_payments", (t) => {
    t.string("code", 30).nullable().unique().after("id")
  })
  await knex("sequences").insert({ key: "payment", prefix: "PAY", format: "{PREFIX}-{YYYY}-{SEQ}", padding: 5, reset: "yearly", next_value: 1 }).onConflict("key").ignore()

  const rows = await knex("invoice_payments").orderBy("created_at").orderBy("id").select("id", "created_at")
  const year = String(new Date().getFullYear())
  let n = 0
  for (const r of rows) {
    n++
    await knex("invoice_payments")
      .where({ id: r.id })
      .update({ code: `PAY-${new Date(r.created_at).getFullYear()}-${String(n).padStart(5, "0")}` })
  }
  if (n)
    await knex("sequences")
      .where({ key: "payment" })
      .update({ next_value: n + 1, period: year })
}

export async function down(knex) {
  await knex.schema.alterTable("invoice_payments", (t) => {
    t.dropColumn("code")
  })
  await knex("sequences").where({ key: "payment" }).delete()
}
