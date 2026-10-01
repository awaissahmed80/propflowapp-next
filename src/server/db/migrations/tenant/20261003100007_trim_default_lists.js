import { LOOKUP_LISTS } from "../../../../modules/lookups/catalog.js"

// Designations and departments now start with a few essentials (the workspace adds its own).
// Removes the older default values nobody uses; values someone has are kept.
export async function up(knex) {
  for (const key of ["designation", "department"]) {
    const keep = LOOKUP_LISTS.find((l) => l.key === key).values.map((v) => v.value)
    const used = (await knex("members").whereNull("deleted_at").whereNotNull(key).distinct(key)).map((r) => r[key])
    await knex("lookups")
      .where({ list_key: key, is_default: true })
      .whereNull("deleted_at")
      .whereNotIn("value", [...keep, ...used])
      .update({ deleted_at: knex.fn.now(3) })
  }
}

// Nothing to undo: the removed values were unused defaults
export async function down() {}
