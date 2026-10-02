import "server-only"
import { live } from "@/server/db/records"
import { LOOKUP_LISTS, lookupList } from "./catalog"

// A workspace's pick-lists: { designation: [{ value, label, color, icon, isActive }], … } in the
// workspace's order. Inactive values are kept so old records still show their label; forms
// offer only the active ones (activeOptions).
export async function getLookups(db, keys) {
  const rows = await live(db, "lookups").whereIn("listKey", keys).orderBy("sortOrder").orderBy("id").select("listKey", "value", "label", "color", "icon", "meta", "isActive", "isPreselected")
  const out = Object.fromEntries(keys.map((k) => [k, []]))
  for (const r of rows) out[r.listKey].push({ value: r.value, label: r.label, color: r.color, icon: r.icon, meta: r.meta ?? {}, isActive: r.isActive, preselected: r.isPreselected })
  return out
}

export const isLookupValue = (values, value) => values.some((v) => v.value === value && v.isActive)
export { lookupList }

// Extra fields as text that doesn't depend on key order (for "changed from defaults")
const sameMeta = (meta) => JSON.stringify(Object.fromEntries(Object.entries(meta ?? {}).sort(([a], [b]) => a.localeCompare(b))))

// Every list for the editor: the definition plus the workspace's values (active or not), whether
// each came with PropFlow, and whether the list differs from the defaults
export async function getLookupLists(db, apps) {
  const lists = LOOKUP_LISTS.filter((l) => !apps || apps.includes(l.app))
  const rows = await live(db, "lookups")
    .whereIn(
      "listKey",
      lists.map((l) => l.key),
    )
    .orderBy("sortOrder")
    .orderBy("id")
    .select("listKey", "value", "label", "color", "icon", "meta", "isDefault", "isActive", "isPreselected")
  return lists.map((l) => {
    const values = rows
      .filter((r) => r.listKey === l.key)
      .map((r) => ({ value: r.value, label: r.label, color: r.color, icon: r.icon, meta: r.meta ?? {}, isDefault: r.isDefault, active: r.isActive, preselected: r.isPreselected }))
    const defaults = l.values.map((v) => [v.value, v.label, v.color ?? null, v.icon ?? null, sameMeta(v.meta), true, v.value === l.defaultValue])
    // Switched-off values the workspace added don't count as a change
    const current = values.filter((v) => v.isDefault || v.active).map((v) => [v.value, v.label, v.color ?? null, v.icon ?? null, sameMeta(v.meta), v.active, Boolean(l.defaultable && v.preselected)])
    return {
      key: l.key,
      name: l.name,
      app: l.app,
      kind: l.kind,
      description: l.description,
      colored: Boolean(l.colored),
      icons: Boolean(l.icons),
      fields: l.fields ?? [],
      defaultable: Boolean(l.defaultable),
      valueIsLabel: Boolean(l.valueIsLabel),
      values,
      customised: JSON.stringify(defaults) !== JSON.stringify(current),
    }
  })
}
