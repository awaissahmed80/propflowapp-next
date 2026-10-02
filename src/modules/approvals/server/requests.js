import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"

// Asking and closing approvals. Apps call these; the inbox decides through server/actions.js.

// New request → its code. { type, app, subjectType, subjectId, title, details?, amount?, link?, reason?, payload?, requestedBy }
export async function createApproval(db, a) {
  let code
  await db.transaction(async (trx) => {
    code = await nextCode(trx, "approval")
    await trx("approvals").insert({ ...a, code, status: "pending", payload: a.payload ? JSON.stringify(a.payload) : null, createdBy: a.requestedBy })
  })
  return code
}

// The open request for a record, if any
export const pendingFor = (db, subjectType, subjectId) => live(db, "approvals").where({ subjectType, subjectId, status: "pending" }).orderBy("id", "desc").first()

// The latest request for a record (open or closed), if any
export const latestFor = (db, subjectType, subjectId) => live(db, "approvals").where({ subjectType, subjectId }).orderBy("id", "desc").first()

// Close a request: approved | rejected | withdrawn
export function closeApproval(db, id, { status, userId, note = null }) {
  return db("approvals").where({ id, status: "pending" }).update({ status, decidedBy: userId, decidedAt: new Date(), decisionNote: note, updatedAt: new Date(), updatedBy: userId })
}
