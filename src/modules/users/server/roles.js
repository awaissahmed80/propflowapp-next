"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { authDb } from "@/server/db/connections"
import { logActivity } from "@/server/tenants/activity"
import { ACTIONS, DEALER_ROLE, cleanAccess, fromMatrix } from "../permissions"
import { usersContext } from "./context"
import { workspaceApps } from "./queries"

// Roles & Permissions. Only people with full access (Owner, Administrator) change roles, so
// nobody can widen their own access. Owner and Administrator themselves can't be changed.

async function roleEditor() {
  const ctx = await usersContext()
  if (!ctx.subscribed || !ctx.fullAccess) return { error: "Only the owner or an administrator can change roles." }
  return { ctx }
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(80, "That's too long."),
  description: z.string().trim().max(255, "Keep it under 255 characters.").optional().default(""),
  // { appCode: ["view", "create", …] }
  matrix: z.record(z.string(), z.array(z.enum(ACTIONS))).default({}),
  access: z.object({ scope: z.record(z.string(), z.string()).default({}), grants: z.record(z.string(), z.unknown()).default({}) }).default({ scope: {}, grants: {} }),
})

// A code for a new role from its name: "Site Manager" → site-manager (site-manager-2 if taken)
async function newCode(db, name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "role"
  const taken = new Set((await db("roles").where("code", "like", `${base}%`).select("code")).map((r) => r.code))
  let code = base
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`
  return code
}

// Create (no id) or update a role → { ok, id } or { error, fieldErrors }
export async function saveRole(input, id) {
  const { ctx, error } = await roleEditor()
  if (error) return { error }
  const parsed = roleSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const data = parsed.data

  const current = id ? await live(ctx.db, "roles").where({ id: Number(id) }).first("id", "name", "permissions", "isSystem") : null
  if (id && !current) return { error: "That role was deleted." }
  if (current?.isSystem) return { error: `${current.name} always has full access and can't be changed.` }
  const clash = await live(ctx.db, "roles").where({ name: data.name }).whereNot({ id: current?.id ?? 0 }).first("id")
  if (clash) return { fieldErrors: { name: "Another role already has this name." } }

  // The matrix covers the apps this workspace has; keep what the role has in other apps, so it
  // still applies if the plan adds them back
  const apps = (await workspaceApps(ctx)).filter((a) => !a.alwaysOn).map((a) => a.code)
  const matrix = Object.fromEntries(apps.map((a) => [a, data.matrix[a] ?? []]))
  const kept = (current?.permissions ?? []).filter((p) => p !== "*" && !apps.includes(p.split(".")[0]))
  const permissions = [...kept, ...fromMatrix(matrix)]
  const { scope, grants } = cleanAccess(data.access)

  const row = { name: data.name, description: data.description || null, permissions: JSON.stringify(permissions), scope: JSON.stringify(scope), grants: JSON.stringify(grants) }
  let roleId = current?.id
  if (current) {
    await ctx.db("roles").where({ id: roleId }).update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
  } else {
    const last = await ctx.db("roles").max({ n: "sortOrder" }).first()
    ;[roleId] = await ctx.db("roles").insert({ ...row, code: await newCode(ctx.db, data.name), sortOrder: (last?.n ?? 0) + 10, createdBy: ctx.user.id })
  }
  await logActivity(ctx.db, {
    type: "role",
    action: current ? "role.updated" : "role.created",
    actorUserId: ctx.user.id,
    summary: current ? `changed the permissions of the ${data.name} role` : `created the ${data.name} role`,
    subjectType: "role",
    subjectId: roleId,
  })
  return { ok: true, id: roleId }
}

// Only roles nobody has (and no invitation is waiting with)
export async function deleteRole(id) {
  const { ctx, error } = await roleEditor()
  if (error) return { error }
  const role = await live(ctx.db, "roles").where({ id: Number(id) }).first("id", "code", "name", "isSystem")
  if (!role) return { error: "That role was already deleted." }
  if (role.isSystem) return { error: `${role.name} can't be deleted.` }
  if (role.code === DEALER_ROLE) return { error: "The Dealer role is used by dealer logins, so it can't be deleted. You can change what it allows." }
  const auth = authDb()
  const [people, invites] = await Promise.all([
    auth("memberships").where({ tenantId: ctx.tenant.id, roleId: role.id }).whereNull("deletedAt").count({ n: "id" }).first(),
    auth("invitations").where({ kind: "tenant", tenantId: ctx.tenant.id, roleId: role.id }).whereNull("acceptedAt").whereNull("revokedAt").whereNull("deletedAt").where("expiresAt", ">", new Date()).count({ n: "id" }).first(),
  ])
  const n = Number(people.n)
  if (n) return { error: `${n} ${n === 1 ? "person has" : "people have"} the ${role.name} role. Give them another role first.` }
  if (Number(invites.n)) return { error: `An invitation is waiting with the ${role.name} role. Cancel it first.` }
  await ctx.db("roles").where({ id: role.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "role", action: "role.deleted", actorUserId: ctx.user.id, summary: `deleted the ${role.name} role`, subjectType: "role", subjectId: role.id })
  return { ok: true }
}
