// Area units seeded before they had "Measures" and "Size": fill those in, keeping any short form
// the workspace already changed.
const UNITS = { marla: ["land", 1], kanal: ["land", 20], acre: ["land", 160], sqft: ["floor", 1], sqyd: ["floor", 9], sqm: ["floor", 10.7639] }

export async function up(knex) {
  for (const [value, [measures, size]] of Object.entries(UNITS)) {
    const row = await knex("lookups").where({ list_key: "area-unit", value }).first("id", "meta")
    if (!row) continue
    const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : (row.meta ?? {})
    await knex("lookups").where({ id: row.id }).update({ meta: JSON.stringify({ measures, size, ...meta }) })
  }
}

export async function down() {}
