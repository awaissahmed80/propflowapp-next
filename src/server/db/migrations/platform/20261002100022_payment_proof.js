// Proof of payment (bank receipt, deposit slip, cheque photo) kept with each recorded payment.
// The file itself is in storage (see src/server/storage); these columns point to it.
export async function up(knex) {
  await knex.schema.alterTable("invoice_payments", (t) => {
    t.string("proof_key", 255).nullable().after("reference")
    t.string("proof_name", 255).nullable().after("proof_key")
    t.string("proof_type", 100).nullable().after("proof_name")
    t.integer("proof_size").unsigned().nullable().after("proof_type")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("invoice_payments", (t) => {
    for (const c of ["proof_key", "proof_name", "proof_type", "proof_size"]) t.dropColumn(c)
  })
}
