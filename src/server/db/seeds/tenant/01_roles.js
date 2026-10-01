import { DEFAULT_ROLES } from "../../../../modules/users/permissions.js"

// Default workspace roles (src/modules/users/permissions.js). Only adds roles the workspace
// has never had, so roles it edits or deletes stay that way. Owner and Administrator always
// have full access and can't be changed or deleted.
export async function seed(knex) {
  // Include deleted roles: a role the workspace removed isn't brought back
  const existing = new Set((await knex("roles").select("code")).map((r) => r.code))
  const missing = DEFAULT_ROLES.filter((r) => !existing.has(r.code))
  if (!missing.length) return
  const last = await knex("roles").max({ n: "sort_order" }).first()
  await knex("roles").insert(
    missing.map((r, i) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      permissions: JSON.stringify(r.permissions),
      scope: r.scope ? JSON.stringify(r.scope) : null,
      grants: r.grants ? JSON.stringify(r.grants) : null,
      is_system: Boolean(r.system),
      sort_order: r.code === "owner" ? 10 : r.code === "admin" ? 20 : Math.max(30, (last?.n ?? 0) + 10) + i * 10,
    }))
  )
}
