"use server"

import { authDb, platformDb } from "@/server/db/connections"
import { requireStaff } from "@/server/auth/dal"
import { logAudit } from "./audit"
import { purgeWorkspace } from "./deletion"

// Deleting from the console: the platform owner only. Workspaces, sales enquiries and workspace
// requests are first deleted softly (hidden everywhere, can be restored); from the Deleted list
// they can then be removed permanently. A workspace's permanent removal needs its code typed in.

async function owner(path) {
  const staff = await requireStaff(path)
  if (staff.role !== "owner") return { error: "Only the platform owner can delete." }
  return { staff }
}
const now = () => new Date()

// ---------- workspaces ----------

// Hide a workspace: nobody can sign in to it, it leaves every list, its data stays → { ok } | { error }
export async function deleteWorkspace(tenantId, reason = "") {
  const { staff, error } = await owner("/workspaces")
  if (error) return { error }
  const why = String(reason ?? "").trim()
  if (why.length < 5) return { error: "Say why it's being deleted (at least 5 characters)." }
  const p = platformDb()
  const t = await p("tenants")
    .where({ id: Number(tenantId) })
    .whereNull("deletedAt")
    .first("id", "code", "name", "status")
  if (!t) return { error: "Workspace not found." }
  await p("tenants").where({ id: t.id }).update({ deletedAt: now(), deletedBy: staff.user.id })
  // Everyone signed in to it is signed out
  await authDb()("sessions").where({ tenantId: t.id }).delete()
  await logAudit({
    actorUserId: staff.user.id,
    action: "tenant.deleted",
    subjectType: "tenant",
    subjectId: t.id,
    tenantId: t.id,
    details: { summary: `Deleted ${t.name} (${t.code}): ${why}`, code: t.code, name: t.name, previousStatus: t.status },
  })
  return { ok: true }
}

export async function restoreWorkspace(tenantId) {
  const { staff, error } = await owner("/workspaces")
  if (error) return { error }
  const p = platformDb()
  const t = await p("tenants")
    .where({ id: Number(tenantId) })
    .whereNotNull("deletedAt")
    .first("id", "code", "name")
  if (!t) return { error: "That workspace isn't in Deleted." }
  await p("tenants").where({ id: t.id }).update({ deletedAt: null, deletedBy: null })
  await logAudit({ actorUserId: staff.user.id, action: "tenant.restored", subjectType: "tenant", subjectId: t.id, tenantId: t.id, details: { summary: `Restored ${t.name} (${t.code})` } })
  return { ok: true }
}

// Remove a deleted workspace for good: files, database, every record → { ok, removed } | { error }
export async function purgeWorkspaceForGood(tenantId, typedCode) {
  const { staff, error } = await owner("/workspaces")
  if (error) return { error }
  const t = await platformDb()("tenants")
    .where({ id: Number(tenantId) })
    .whereNotNull("deletedAt")
    .first("id", "code", "name", "dbName", "dbHost")
  if (!t) return { error: "Only a deleted workspace can be removed permanently. Delete it first." }
  if (
    String(typedCode ?? "")
      .trim()
      .toUpperCase() !== t.code
  )
    return { error: `Type ${t.code} to confirm.` }
  let removed
  try {
    removed = await purgeWorkspace(t, { staffUserId: staff.user.id })
  } catch (err) {
    console.error(`Purge ${t.code} failed:`, err)
    return { error: `Removing ${t.code} stopped part way: ${err.message}. Try again; what's already gone stays gone.` }
  }
  await logAudit({
    actorUserId: staff.user.id,
    action: "tenant.purged",
    subjectType: "tenant",
    subjectId: t.id,
    tenantId: t.id,
    details: { summary: `Permanently removed ${t.name} (${t.code}): database ${removed.database}, ${removed.files} files, ${removed.users} accounts`, code: t.code, name: t.name, ...removed },
  })
  return { ok: true, removed }
}

// ---------- sales enquiries and workspace requests ----------

const TABLES = { enquiry: ["enquiries", "/enquiries", "Enquiry"], request: ["supportRequests", "/requests", "Workspace request"] }

// Discard (hide, can be restored) → { ok } | { error }
export async function discardItem(kind, id) {
  const [table, path, label] = TABLES[kind] ?? []
  if (!table) return { error: "Unknown item." }
  const { staff, error } = await owner(path)
  if (error) return { error }
  const p = platformDb()
  const row = await p(table)
    .where({ id: Number(id) })
    .whereNull("deletedAt")
    .first("id", "code")
  if (!row) return { error: `${label} not found.` }
  await p(table).where({ id: row.id }).update({ deletedAt: now(), deletedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: `${kind}.discarded`, subjectType: kind, subjectId: row.id, details: { summary: `Discarded ${row.code ?? `${label} ${row.id}`}` } })
  return { ok: true }
}

export async function restoreItem(kind, id) {
  const [table, path, label] = TABLES[kind] ?? []
  if (!table) return { error: "Unknown item." }
  const { staff, error } = await owner(path)
  if (error) return { error }
  const p = platformDb()
  const row = await p(table)
    .where({ id: Number(id) })
    .whereNotNull("deletedAt")
    .first("id", "code")
  if (!row) return { error: `${label} isn't in Discarded.` }
  await p(table).where({ id: row.id }).update({ deletedAt: null, deletedBy: null })
  await logAudit({ actorUserId: staff.user.id, action: `${kind}.restored`, subjectType: kind, subjectId: row.id, details: { summary: `Restored ${row.code ?? `${label} ${row.id}`}` } })
  return { ok: true }
}

// Remove a discarded enquiry / request for good (a request's messages and screenshots too)
export async function purgeItem(kind, id) {
  const [table, path, label] = TABLES[kind] ?? []
  if (!table) return { error: "Unknown item." }
  const { staff, error } = await owner(path)
  if (error) return { error }
  const p = platformDb()
  const row = await p(table)
    .where({ id: Number(id) })
    .whereNotNull("deletedAt")
    .first("id", "code")
  if (!row) return { error: `Only a discarded ${label.toLowerCase()} can be removed permanently.` }
  if (kind === "request") {
    const { deleteFile } = await import("@/server/storage")
    const messages = await p("supportMessages").where({ requestId: row.id }).select("attachments")
    for (const m of messages) for (const a of (typeof m.attachments === "string" ? JSON.parse(m.attachments) : m.attachments) ?? []) if (a?.key) await deleteFile(a.key).catch(() => {})
    await p.transaction(async (trx) => {
      await trx("supportMessages").where({ requestId: row.id }).delete()
      await trx(table).where({ id: row.id }).delete()
    })
  } else await p(table).where({ id: row.id }).delete()
  await logAudit({ actorUserId: staff.user.id, action: `${kind}.purged`, subjectType: kind, subjectId: row.id, details: { summary: `Permanently removed ${row.code ?? `${label} ${row.id}`}` } })
  return { ok: true }
}
