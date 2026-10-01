import "server-only"
import { platformDb } from "@/server/db/connections"
import { requestInfo } from "@/server/auth/session"

// Record a console change. action is a dotted code from AUDIT_ACTIONS (statuses.js);
// details.summary is the one line people read, anything else is kept for the record.
// Pass the transaction that made the change so both are saved or neither is.
export async function logAudit({ actorUserId, action, subjectType = null, subjectId = null, tenantId = null, details = {} }, db = platformDb()) {
  const { ip } = await requestInfo()
  await db("auditLog").insert({ actorUserId, action, subjectType, subjectId, tenantId, details: JSON.stringify(details), ip })
}
