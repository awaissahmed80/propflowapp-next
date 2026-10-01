// Unit types, block categories and area units became lists the workspace can change; their
// built-in values get the settings the code now reads from the list (how a type is sized, which
// blocks it fits, what a category holds, how big a unit is).
const TYPES = { plot: ["land", "both"], file: ["land", "files"], house: ["land", "residential"], apartment: ["floor", "residential"], shop: ["floor", "commercial"], office: ["floor", "commercial"], farmhouse: ["land", "residential"] }
const CATEGORIES = { residential: "residential", commercial: "commercial" }

async function mergeMeta(knex, listKey, value, extra) {
  const row = await knex("lookups").where({ list_key: listKey, value }).first("id", "meta")
  if (!row) return
  const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : (row.meta ?? {})
  await knex("lookups").where({ id: row.id }).update({ meta: JSON.stringify({ ...extra, ...meta, ...Object.fromEntries(Object.entries(extra).filter(([k]) => meta[k] == null)) }) })
}

export async function up(knex) {
  for (const [value, [measures, fits]] of Object.entries(TYPES)) await mergeMeta(knex, "unit-type", value, { measures, fits })
  for (const [value, holds] of Object.entries(CATEGORIES)) await mergeMeta(knex, "block-category", value, { holds })
}

export async function down() {}
