import { LOOKUP_LISTS } from "../../../../modules/lookups/catalog.js"

// Pick-list values that come with PropFlow (src/modules/lookups/catalog.js). Only adds values the
// workspace has never had: ones it relabelled or deleted are left as they are.
export async function seed(knex) {
  const existing = new Set((await knex("lookups").select("list_key", "value")).map((r) => `${r.list_key}:${r.value}`))
  const rows = LOOKUP_LISTS.flatMap((list) =>
    list.values
      .map((v, i) => ({ list_key: list.key, value: v.value, label: v.label, color: v.color ?? null, icon: v.icon ?? null, meta: v.meta ? JSON.stringify(v.meta) : null, is_default: true, is_preselected: v.value === list.defaultValue, sort_order: (i + 1) * 10 }))
      .filter((r) => !existing.has(`${r.list_key}:${r.value}`))
  )
  if (rows.length) await knex("lookups").insert(rows)
}
