// Numbering for platform codes. Only adds missing sequences: existing counters are never touched.
const SEQUENCES = [
  { key: "tenant", prefix: "TEN", format: "{PREFIX}{SEQ}", padding: 5, reset: "never" },
  { key: "invoice", prefix: "INV", format: "{PREFIX}-{YYYY}-{SEQ}", padding: 5, reset: "yearly" },
  { key: "enquiry", prefix: "ENQ", format: "{PREFIX}-{YY}-{SEQ}", padding: 4, reset: "yearly" },
  { key: "payment", prefix: "PAY", format: "{PREFIX}-{YYYY}-{SEQ}", padding: 5, reset: "yearly" },
  { key: "support_request", prefix: "REQ", format: "{PREFIX}-{YY}-{SEQ}", padding: 4, reset: "yearly" },
]

export async function seed(knex) {
  await knex("sequences").insert(SEQUENCES.map((s) => ({ ...s, next_value: 1 }))).onConflict("key").ignore()
}
