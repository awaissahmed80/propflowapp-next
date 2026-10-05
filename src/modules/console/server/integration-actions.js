"use server"

import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireStaff } from "@/server/auth/dal"
import { logActivity } from "@/server/tenants/activity"
import { can } from "@/modules/console/roles"
import { INTEGRATION_STATUS, integrationByKey } from "@/modules/integrations/catalog"
import { disconnectMetaFor } from "@/modules/campaigns/server/meta"
import { SMS_KEY } from "@/server/sms"
import { sourceByIntegration } from "@/modules/integrations/leads/sources"
import { logAudit } from "./audit"

// Integrations from the console: the platform status of each one (owner and admin, Platform
// settings) and, for one workspace, switching an integration off or on and disconnecting
// Facebook (owner and admin, Workspaces). Every change goes to the audit log.

// → { ok } | { error }
export async function setIntegrationStatus(key, status) {
  const staff = await requireStaff("/integrations")
  if (!can(staff.role, "settings")) return { error: "Only the owner or an administrator can change integrations." }
  const def = integrationByKey(key)
  if (!def || !INTEGRATION_STATUS[status]) return { error: "Choose an integration and a status." }
  if (status === "live" && !def.built) return { error: `${def.name} isn't built yet, so it can't go live.` }
  await platformDb()("integrations").insert({ key, status, updatedAt: new Date(), updatedBy: staff.user.id }).onConflict("key").merge({ status, updatedAt: new Date(), updatedBy: staff.user.id })
  await logAudit({ actorUserId: staff.user.id, action: "integration.status", subjectType: "integration", details: { summary: `${def.name}: ${INTEGRATION_STATUS[status].label}`, key, status } })
  return { ok: true }
}

async function workspaceStaff(tenantId) {
  const staff = await requireStaff("/workspaces")
  if (!can(staff.role, "workspaces")) return { error: "Only the owner or an administrator can change workspaces." }
  const tenant = await live(platformDb(), "tenants")
    .where({ id: Number(tenantId) })
    .first("id", "code", "name", "dbName", "dbHost", "status")
  if (!tenant) return { error: "Workspace not found." }
  return { staff, tenant }
}

// Switch one integration off (with a reason) or back on for a workspace → { ok } | { error }
export async function setWorkspaceIntegration(tenantId, key, enabled, note = "") {
  const { staff, tenant, error } = await workspaceStaff(tenantId)
  if (error) return { error }
  const def = integrationByKey(key)
  if (!def) return { error: "Unknown integration." }
  const why = String(note ?? "")
    .trim()
    .slice(0, 300)
  if (!enabled && why.length < 5) return { error: "Say why it's being switched off (at least 5 characters)." }
  const row = { enabled: Boolean(enabled), note: enabled ? null : why, updatedAt: new Date(), updatedBy: staff.user.id }
  await platformDb()("tenantIntegrations")
    .insert({ tenantId: tenant.id, key, ...row })
    .onConflict(["tenantId", "key"])
    .merge(row)
  await logAudit({
    actorUserId: staff.user.id,
    action: "integration.workspace",
    subjectType: "tenant",
    subjectId: tenant.id,
    tenantId: tenant.id,
    details: { summary: `${def.name} ${enabled ? "switched back on" : `switched off: ${why}`}`, key, enabled: Boolean(enabled) },
  })
  return { ok: true }
}

// Disconnect a workspace's Facebook (stops all its lead ads) → { ok } | { error }
export async function disconnectWorkspaceMeta(tenantId) {
  const { staff, tenant, error } = await workspaceStaff(tenantId)
  if (error) return { error }
  const site = { db: tenantDb(tenant), tenant }
  const pages = await disconnectMetaFor(site)
  await logActivity(site.db, { type: "campaigns", action: "meta.disconnected", summary: "Facebook lead ads were disconnected by PropFlow support" })
  await logAudit({
    actorUserId: staff.user.id,
    action: "meta.disconnected",
    subjectType: "tenant",
    subjectId: tenant.id,
    tenantId: tenant.id,
    details: { summary: `Facebook disconnected (${pages} ${pages === 1 ? "Page" : "Pages"} receiving leads)` },
  })
  return { ok: true }
}

// Disconnect a workspace's SMS gateway (its provider account stays theirs) → { ok } | { error }
export async function disconnectWorkspaceSms(tenantId) {
  const { staff, tenant, error } = await workspaceStaff(tenantId)
  if (error) return { error }
  const db = tenantDb(tenant)
  await db("settings")
    .where({ key: SMS_KEY })
    .update({ value: JSON.stringify(null), updatedAt: new Date() })
  await logActivity(db, { type: "settings", action: "sms.disconnected", summary: "The SMS gateway was disconnected by PropFlow support" })
  await logAudit({ actorUserId: staff.user.id, action: "sms.disconnected", subjectType: "tenant", subjectId: tenant.id, tenantId: tenant.id, details: { summary: "SMS gateway disconnected" } })
  return { ok: true }
}

// Stop accepting a workspace's Google Ads lead forms or Google Forms (its key stops working; forms,
// leads and the log stay) → { ok } | { error }
export async function disconnectWorkspaceLeadSource(tenantId, integrationKey) {
  const { staff, tenant, error } = await workspaceStaff(tenantId)
  if (error) return { error }
  const src = sourceByIntegration(integrationKey)
  if (!src) return { error: "Unknown integration." }
  const db = tenantDb(tenant)
  const row = await db("settings").where({ key: src.settingsKey }).first("value")
  const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value
  if (v)
    await db("settings")
      .where({ key: src.settingsKey })
      .update({ value: JSON.stringify({ ...v, key: null }), updatedAt: new Date() })
  await logActivity(db, { type: "campaigns", action: `${src.key}.disconnected`, summary: `${src.name} was disconnected by PropFlow support` })
  await logAudit({
    actorUserId: staff.user.id,
    action: "integration.disconnected",
    subjectType: "tenant",
    subjectId: tenant.id,
    tenantId: tenant.id,
    details: { summary: `${src.name} disconnected`, key: integrationKey },
  })
  return { ok: true }
}
