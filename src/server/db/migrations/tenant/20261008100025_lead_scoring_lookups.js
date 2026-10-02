// Lead scoring: activity types got score points and outcomes an effect on the score (Lists &
// Labels). Give existing workspaces the defaults, only where none has been set.
const POINTS = { call: 3, whatsapp: 2, "site-visit": 10, meeting: 8, email: 1, sms: 1 }
const SIGNALS = { interested: "positive", "call-back": "neutral", "no-answer": "neutral", "not-interested": "negative" }

async function fill(knex, listKey, key, defaults) {
  const rows = await knex("lookups").where({ list_key: listKey }).whereIn("value", Object.keys(defaults)).select("id", "value", "meta")
  for (const r of rows) {
    const meta = typeof r.meta === "string" ? JSON.parse(r.meta) : (r.meta ?? {})
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== "") continue
    await knex("lookups")
      .where({ id: r.id })
      .update({ meta: JSON.stringify({ ...meta, [key]: defaults[r.value] }) })
  }
}

export async function up(knex) {
  await fill(knex, "activity-type", "points", POINTS)
  await fill(knex, "activity-outcome", "signal", SIGNALS)
}

export async function down() {
  // Extra fields are harmless to keep
}
