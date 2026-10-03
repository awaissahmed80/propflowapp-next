// American spelling: labels that came with PropFlow in British spelling, unless a workspace
// already renamed them
const LABELS = [
  ["Cancelled", "Canceled"],
  ["Square metres", "Square meters"],
  ["Community centre", "Community center"],
]

export async function up(knex) {
  for (const [from, to] of LABELS) await knex("lookups").where({ label: from, is_default: true }).update({ label: to })
}

export async function down(knex) {
  for (const [from, to] of LABELS) await knex("lookups").where({ label: to, is_default: true }).update({ label: from })
}
