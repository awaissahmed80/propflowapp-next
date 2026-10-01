// Each unit keeps the base rate it was priced at (per marla, or per sq ft for apartments, shops and
// offices), so changing its size or features later recalculates its price from the same rate.
// Existing units get it from their base price and size.
export async function up(knex) {
  await knex.schema.alterTable("units", (t) => {
    t.decimal("base_rate", 15, 2).nullable().after("base_price")
  })
  await knex.raw(`
    UPDATE units SET base_rate = ROUND(base_price / CASE size_unit
      WHEN 'marla' THEN size_value
      WHEN 'kanal' THEN size_value * 20
      ELSE NULLIF(area_sqft, 0) END, 2)
    WHERE base_rate IS NULL`)
}

export async function down(knex) {
  await knex.schema.alterTable("units", (t) => {
    t.dropColumn("base_rate")
  })
}
