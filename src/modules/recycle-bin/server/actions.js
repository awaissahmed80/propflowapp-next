"use server"

import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { can, isFullAccess } from "@/modules/users/permissions"
import { KINDS } from "../kinds"
import { binDelete, binList, binPurge, binRestore } from "./engine"

// The recycle bin. Deleting moves a record to the bin (soft delete, with the child rows that go
// with it); anyone whose role may delete in that app can do that. Restoring and removing for good
// are for administrators (full access) only, from Settings › Recycle bin.

async function context() {
  const s = await requireTenant("/settings/recycle-bin")
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const role = await live(db, "roles").where({ id: s.membership.roleId }).first("permissions")
  const permissions = role?.permissions ?? []
  return { db, user: s.user, tenant: s.tenant, permissions, admin: isFullAccess(permissions) }
}
const NOT_ADMIN = "Only administrators can restore or permanently delete."

// deleteRecords("lead", ["LD-00012", …]) → { ok, count, skipped: [why] } | { error }
export async function deleteRecords(kind, keys) {
  const k = KINDS[kind]
  if (!k) return { error: "Unknown kind of record." }
  const ctx = await context()
  if (!can(ctx.permissions, k.app, "delete")) return { error: `Your role can't delete ${k.label.toLowerCase()}s. Ask an administrator.` }
  return binDelete(ctx, kind, keys)
}

// Settings › Recycle bin → { items }
export async function listBin() {
  const ctx = await context()
  if (!ctx.admin) return { error: "Only administrators can open the recycle bin.", items: [] }
  return binList(ctx)
}

// restoreRecords([{ kind, key }]) → { ok, count, skipped } | { error }
export async function restoreRecords(list) {
  const ctx = await context()
  return ctx.admin ? binRestore(ctx, list) : { error: NOT_ADMIN }
}

// purgeRecords([{ kind, key }]) → { ok, count, skipped } | { error }
export async function purgeRecords(list) {
  const ctx = await context()
  return ctx.admin ? binPurge(ctx, list) : { error: NOT_ADMIN }
}
