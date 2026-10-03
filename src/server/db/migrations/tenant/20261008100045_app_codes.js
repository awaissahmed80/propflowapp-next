// App codes follow the app names: estate → portfolio (Project Portfolio), sales → operations
// (Operations), services → estate (Estate Management). Renames them wherever a workspace stores
// them: role permissions, scopes and grants, approvals, notifications, files, the activity log
// and the apps' settings keys. Every rename maps all three at once, so "estate" never clashes.
const UP = { estate: "portfolio", sales: "operations", services: "estate" }
const DOWN = { portfolio: "estate", operations: "sales", estate: "services" }

const json = (v) => {
  if (v == null) return v
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}
// "sales.discount" → "operations.discount", "estate" → "portfolio"
const key = (map, k) => {
  const [app, ...rest] = String(k).split(".")
  return map[app] ? [map[app], ...rest].join(".") : k
}
const SETTINGS = (map) => ({
  ...Object.fromEntries(
    ["approve_discounts", "approve_refunds", "agent_commission_pct", "cancel_deduction_pct", "commission_trigger", "dealer_commission_pct", "dealer_wht_pct", "defaulter_days", "defaulter_lines", "enforce_documents"].map(
      (k) => (map === UP ? [`sales_${k}`, `operations_${k}`] : [`operations_${k}`, `sales_${k}`]),
    ),
  ),
  ...(map === UP ? { services_settings: "estate_settings" } : { estate_settings: "services_settings" }),
})

async function run(knex, map) {
  const roles = await knex("roles").select("id", "permissions", "scope", "grants")
  for (const r of roles) {
    const permissions = json(r.permissions)
    const scope = json(r.scope)
    const grants = json(r.grants)
    await knex("roles")
      .where({ id: r.id })
      .update({
        permissions: Array.isArray(permissions) ? JSON.stringify(permissions.map((p) => key(map, p))) : r.permissions,
        scope: scope && typeof scope === "object" ? JSON.stringify(Object.fromEntries(Object.entries(scope).map(([k, v]) => [key(map, k), v]))) : r.scope,
        grants: grants && typeof grants === "object" ? JSON.stringify(Object.fromEntries(Object.entries(grants).map(([k, v]) => [key(map, k), v]))) : r.grants,
      })
  }
  const cases = (col) => [
    `case ${col} ${Object.keys(map)
      .map(() => "when ? then ?")
      .join(" ")} else ${col} end`,
    Object.entries(map).flat(),
  ]
  for (const [table, col] of [
    ["approvals", "app"],
    ["notifications", "app"],
    ["assets", "app"],
    ["asset_folders", "app"],
    ["activity_log", "type"],
  ]) {
    if (!(await knex.schema.hasTable(table))) continue
    const [sql, bindings] = cases(col)
    await knex.raw(
      `update ?? set ?? = ${sql} where ?? in (${Object.keys(map)
        .map(() => "?")
        .join(", ")})`,
      [table, col, ...bindings, col, ...Object.keys(map)],
    )
  }
  // Activity actions named after the app ("sales.settings")
  const actions = await knex("activity_log")
    .where((q) => Object.keys(map).forEach((app) => q.orWhere("action", "like", `${app}.%`)))
    .select("id", "action")
  for (const a of actions)
    await knex("activity_log")
      .where({ id: a.id })
      .update({ action: key(map, a.action) })
  for (const [from, to] of Object.entries(SETTINGS(map))) await knex("settings").where({ key: from }).update({ key: to })
}

export const up = (knex) => run(knex, UP)
export const down = (knex) => run(knex, DOWN)
