"use server"

import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, isFullAccess } from "@/modules/users/permissions"
import { IMAGE_TYPES, assetUrl } from "./index"

// The file manager's Library: files already in the workspace that this person may see (their
// role can view the file's app; private ones need edit), newest first. Same file stored once
// shows once. filters: { collection: "images" | "documents", search, ownerType, ownerCode }

// How to name each kind of owner in the library ("Skyline Enclave")
const OWNERS = { project: { table: "projects", label: "name", code: "code" } }

export async function listAssetLibrary({ collection = "images", search = "", ownerType = null, ownerCode = null } = {}) {
  const s = await requireTenant("/")
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const role = await live(db, "roles").where({ id: s.membership.roleId }).first("permissions")
  const permissions = role?.permissions ?? []
  const full = isFullAccess(permissions)

  let q = live(db, "assets").orderBy("createdAt", "desc").limit(400)
  if (collection === "images") q = q.whereIn("mime", IMAGE_TYPES)
  const term = String(search).trim()
  if (term) q = q.where((w) => w.whereLike("title", `%${term}%`).orWhereLike("fileName", `%${term}%`))
  if (ownerType && ownerCode && OWNERS[ownerType]) {
    const o = OWNERS[ownerType]
    const owner = await live(db, o.table)
      .where({ [o.code]: String(ownerCode).toUpperCase() })
      .first("id")
    q = q.where({ ownerType, ownerId: owner?.id ?? 0 })
  }
  const rows = (await q).filter((a) => full || can(permissions, a.app, a.isPrivate ? "edit" : "view"))

  // One entry per stored file
  const seen = new Set()
  const unique = rows.filter((a) => (seen.has(a.fileKey) ? false : seen.add(a.fileKey)))

  // Owner names for context
  const names = new Map()
  for (const [type, o] of Object.entries(OWNERS)) {
    const ids = [...new Set(unique.filter((a) => a.ownerType === type).map((a) => a.ownerId))]
    if (ids.length) for (const r of await db(o.table).whereIn("id", ids).select("id", o.label)) names.set(`${type}:${r.id}`, r[o.label])
  }
  return unique.slice(0, 200).map((a) => ({
    code: a.code,
    title: a.title,
    fileName: a.fileName,
    mime: a.mime,
    size: a.size,
    category: a.category,
    app: a.app,
    owner: a.ownerType ? (names.get(`${a.ownerType}:${a.ownerId}`) ?? null) : null,
    createdAt: a.createdAt,
    url: assetUrl(a.code),
  }))
}
