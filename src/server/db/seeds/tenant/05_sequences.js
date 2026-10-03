// Numbering for the workspace's own codes. Only adds missing sequences: counters are never reset.
const SEQUENCES = [
  { key: "member", prefix: "MEM", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never" },
  { key: "dealer", prefix: "DLR", format: "{PREFIX}-{SEQ}", padding: 4, reset: "never" },
]

export async function seed(knex) {
  await knex("sequences")
    .insert(SEQUENCES.map((s) => ({ ...s, next_value: 1 })))
    .onConflict("key")
    .ignore()
}
