// Lead temperature goes from three levels (hot / warm / cold) to five with icons:
// very cold, cold, moderate, hot, very hot. Warm becomes moderate; the new values are added by
// the lookups seed that runs after migrations.
const LEVELS = [
  ["very-cold", "Very cold", "#2563eb", "snowflake-line"],
  ["cold", "Cold", "#0ea5e9", "temp-cold-line"],
  ["moderate", "Moderate", "#f59e0b", "sun-cloudy-line"],
  ["hot", "Hot", "#f97316", "fire-line"],
  ["very-hot", "Very hot", "#dc2626", "fire-fill"],
]

export async function up(knex) {
  await knex("lookups").where({ list_key: "lead-priority", value: "warm" }).update({ value: "moderate", label: "Moderate" })
  for (const [i, [value, label, color, icon]] of LEVELS.entries())
    await knex("lookups")
      .where({ list_key: "lead-priority", value })
      .update({ label, color, icon, sort_order: (i + 1) * 10, is_preselected: value === "moderate" })
  await knex("leads").where({ priority: "warm" }).update({ priority: "moderate" })
  await knex.schema.alterTable("leads", (t) => {
    t.string("priority", 20).notNullable().defaultTo("moderate").alter()
  })
}

export async function down(knex) {
  await knex("leads").whereIn("priority", ["moderate"]).update({ priority: "warm" })
  await knex("leads").where({ priority: "very-hot" }).update({ priority: "hot" })
  await knex("leads").where({ priority: "very-cold" }).update({ priority: "cold" })
  await knex("lookups").where({ list_key: "lead-priority", value: "moderate" }).update({ value: "warm", label: "Warm" })
  await knex("lookups").where({ list_key: "lead-priority" }).whereIn("value", ["very-hot", "very-cold"]).delete()
  await knex.schema.alterTable("leads", (t) => {
    t.string("priority", 20).notNullable().defaultTo("warm").alter()
  })
}
