import "server-only"
import { authDb, closeTenantDb, platformDb, provisionDb, tenantDb } from "@/server/db/connections"
import { deleteFile } from "@/server/storage"

// Removing a workspace for good (Console › Workspaces › Deleted › Delete permanently): its files in
// storage, its database, and every platform and sign-in record attached to it. People whose only
// workspace it was lose their accounts too (never console staff). The console audit log is kept: it
// is the record that the workspace existed and who removed it.

const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

// Storage keys of everything the workspace stored, read before its database goes
async function storedFiles(tenant) {
  const keys = new Set()
  try {
    const db = tenantDb(tenant)
    for (const r of await db("assets").select("fileKey")) if (r.fileKey) keys.add(r.fileKey)
    const logo = await db("settings").where({ key: "company_logo" }).first("value")
    const v = parse(logo?.value)
    if (typeof v === "string" && v) keys.add(v)
  } catch (err) {
    console.error(`Purge ${tenant.code}: couldn't list files:`, err.message)
  }
  const p = platformDb()
  for (const m of await p("supportMessages as m").join("supportRequests as r", "r.id", "m.requestId").where("r.tenantId", tenant.id).whereNotNull("m.attachments").select("m.attachments"))
    for (const a of parse(m.attachments) ?? []) if (a?.key) keys.add(a.key)
  for (const r of await p("invoicePayments as ip").join("invoices as i", "i.id", "ip.invoiceId").where("i.tenantId", tenant.id).whereNotNull("ip.proofKey").select("ip.proofKey")) keys.add(r.proofKey)
  return [...keys]
}

// → { files, users, database } (what was removed)
export async function purgeWorkspace(tenant, { staffUserId }) {
  const p = platformDb()
  const auth = authDb()

  // 1. Files in storage (best effort: a missing file doesn't stop the rest)
  const keys = await storedFiles(tenant)
  let files = 0
  for (const key of keys) {
    try {
      await deleteFile(key)
      files += 1
    } catch {
      // already gone, or a key from an older layout
    }
  }

  // 2. The workspace's database
  await closeTenantDb(tenant)
  const admin = provisionDb({ host: tenant.dbHost || undefined })
  try {
    await admin.raw("DROP DATABASE IF EXISTS ??", [tenant.dbName])
  } finally {
    await admin.destroy()
  }

  // 3. Sign-in records: memberships, sessions, invitations, history; and accounts that belonged to
  //    this workspace only (not console staff, not the person removing it)
  const members = (await auth("memberships").where({ tenantId: tenant.id }).select("userId")).map((m) => m.userId)
  const elsewhere = new Set(
    (
      await auth("memberships")
        .whereIn("userId", members.length ? members : [0])
        .whereNot({ tenantId: tenant.id })
        .whereNull("deletedAt")
        .select("userId")
    ).map((m) => m.userId),
  )
  const staff = new Set((await p("platformStaff").select("userId")).map((s) => s.userId))
  const orphans = members.filter((id) => !elsewhere.has(id) && !staff.has(id) && id !== staffUserId)
  await auth.transaction(async (trx) => {
    await trx("sessions").where({ tenantId: tenant.id }).delete()
    await trx("loginHistory").where({ tenantId: tenant.id }).delete()
    await trx("invitations").where({ tenantId: tenant.id }).delete()
    await trx("memberships").where({ tenantId: tenant.id }).delete()
    if (orphans.length) {
      await trx("sessions").whereIn("userId", orphans).delete()
      await trx("loginHistory").whereIn("userId", orphans).delete()
      await trx("oneTimeCodes").whereIn("userId", orphans).delete()
      await trx("memberships").whereIn("userId", orphans).delete()
      await trx("users").whereIn("id", orphans).delete()
    }
  })

  // 4. Platform records
  await p.transaction(async (trx) => {
    const invoices = (await trx("invoices").where({ tenantId: tenant.id }).select("id")).map((i) => i.id)
    if (invoices.length) {
      await trx("invoicePayments").whereIn("invoiceId", invoices).delete()
      await trx("invoiceLines").whereIn("invoiceId", invoices).delete()
      await trx("invoices").whereIn("id", invoices).delete()
    }
    await trx("subscriptions").where({ tenantId: tenant.id }).delete()
    const requests = (await trx("supportRequests").where({ tenantId: tenant.id }).select("id")).map((r) => r.id)
    if (requests.length) {
      await trx("supportMessages").whereIn("requestId", requests).delete()
      await trx("supportRequests").whereIn("id", requests).delete()
    }
    for (const t of ["workspaceInvitations", "impersonations", "tenantApps", "tenantIntegrations", "metaPages"]) await trx(t).where({ tenantId: tenant.id }).delete()
    await trx("tenants").where({ id: tenant.id }).delete()
  })
  return { files, users: orphans.length, database: tenant.dbName }
}
