// Tables and columns are snake_case in MySQL; the app works in camelCase.
// Knex converts identifiers on the way in and result keys on the way out.

export const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase()
export const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

// Deep-convert result rows; Dates, Buffers and other objects are left alone
function camelKeys(value) {
  if (Array.isArray(value)) return value.map(camelKeys)
  if (value && value.constructor === Object) {
    const out = {}
    // `alive` only exists for unique-among-live indexes; keep it out of app data
    for (const [k, v] of Object.entries(value)) if (k !== "alive") out[toCamel(k)] = camelKeys(v)
    return out
  }
  return value
}

// Options merged into a Knex config to switch case conversion on.
// Careful with .pluck(): Knex picks the value out of each row before this conversion runs, so
// pluck("appId") looks for row.appId in { app_id: … } and returns undefined. Pluck single-word
// columns only (id, code, name); otherwise select("appId") and map.
export const caseMapping = {
  // "*" and already-quoted pieces pass through untouched
  wrapIdentifier: (value, origImpl) => origImpl(value === "*" ? value : toSnake(value)),
  postProcessResponse: (result) => camelKeys(result),
}
