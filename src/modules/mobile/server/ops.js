import "server-only"
import { z } from "zod"
import { tenantDb } from "@/server/db/connections"

// Writes from the app applied once per opId (tenant sync_ops): the phone makes an opId for each
// change and sends it again, unchanged, until it has an answer. A repeat gets the answer the first
// one got (replayed: true) instead of being done twice; the same opId from someone else, or for
// something else, is a conflict (409 op_conflict). Only changes that worked are kept against the
// opId, so a refused one can be fixed and sent again with the same opId.

export const opIdField = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,36}$/)
  .optional()
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : (v ?? null))

// run() → { ok, … } | { error } | …; without an opId it just runs.
// kind: what the change is ("leads.create"…); access: mobileAccess
export async function onceOp(access, kind, opId, run) {
  if (!opId) return run()
  const db = tenantDb({ dbName: access.tenant.dbName, dbHost: access.tenant.dbHost })
  const prev = await db("syncOps").where({ opId }).first("userId", "kind", "result")
  if (prev) return prev.userId === access.user.id && prev.kind === kind ? { ...parse(prev.result), replayed: true } : { conflict: true }
  const out = await run()
  if (out?.ok)
    await db("syncOps")
      .insert({ opId, sessionId: access.session.id, userId: access.user.id, kind, result: JSON.stringify(out) })
      .onConflict("opId")
      .ignore()
  return out
}
