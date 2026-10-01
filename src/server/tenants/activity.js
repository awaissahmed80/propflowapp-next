import "server-only"

// The workspace activity log (Users & Teams › Activity Log). summary reads after the person's
// name: logActivity(db, { type: "role", action: "member.role_changed", actorUserId,
// summary: "gave Ali Raza the Sales Manager role", subjectType: "user", subjectId }).
// Never throws: a failed log line mustn't undo the change it describes.
export async function logActivity(db, { type, action, actorUserId = null, summary, subjectType = null, subjectId = null, details = null, ip = null }) {
  try {
    await db("activityLog").insert({ type, action, actorUserId, summary: String(summary).slice(0, 500), subjectType, subjectId, details: details ? JSON.stringify(details) : null, ip })
  } catch (err) {
    console.error("Activity log failed:", err.message)
  }
}

// Log to a workspace by its id (when there's no workspace database handle at hand)
export async function logToWorkspace(tenantId, entry) {
  try {
    const { platformDb, tenantDb } = await import("@/server/db/connections")
    const tenant = await platformDb()("tenants").where({ id: tenantId }).whereNull("deletedAt").first("dbName", "dbHost", "status")
    if (tenant && tenant.status !== "provisioning") await logActivity(tenantDb(tenant), entry)
  } catch (err) {
    console.error("Activity log failed:", err.message)
  }
}

// Log to every workspace someone belongs to (password reset and other account-wide events)
export async function logToMemberships(userId, entry) {
  try {
    const { authDb } = await import("@/server/db/connections")
    const rows = await authDb()("memberships").where({ userId }).whereIn("status", ["active", "suspended"]).whereNull("deletedAt").select("tenantId")
    for (const r of rows) await logToWorkspace(r.tenantId, { actorUserId: userId, ...entry })
  } catch (err) {
    console.error("Activity log failed:", err.message)
  }
}
