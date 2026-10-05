import { DEFAULT_ROLES } from "../../../../modules/users/permissions.js"

// Default workspace roles (src/modules/users/permissions.js). Adds roles the workspace has never
// had, and brings default roles nobody in the workspace has edited (updated_by is empty) up to
// the current defaults. Roles it edited or deleted stay as they are. Owner and Administrator
// always have full access and can't be changed or deleted.
const row = (r) => ({
  name: r.name,
  description: r.description,
  permissions: JSON.stringify(r.permissions),
  scope: r.scope ? JSON.stringify(r.scope) : null,
  grants: r.grants ? JSON.stringify(r.grants) : null,
  is_system: Boolean(r.system),
})

export async function seed(knex) {
  // Include deleted roles: a role the workspace removed isn't brought back
  const existing = new Map((await knex("roles").select("code", "updated_by", "deleted_at")).map((r) => [r.code, r]))
  for (const r of DEFAULT_ROLES) {
    const had = existing.get(r.code)
    if (had && !had.updated_by && !had.deleted_at && !r.system) await knex("roles").where({ code: r.code }).update(row(r))
  }
  const missing = DEFAULT_ROLES.filter((r) => !existing.has(r.code))
  if (!missing.length) return
  const last = await knex("roles").max({ n: "sort_order" }).first()
  await knex("roles").insert(
    missing.map((r, i) => ({
      code: r.code,
      ...row(r),
      sort_order: r.code === "owner" ? 10 : r.code === "admin" ? 20 : Math.max(30, (last?.n ?? 0) + 10) + i * 10,
    })),
  )
}
