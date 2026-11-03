import { z } from "zod"
import { fail, failWith, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { decideApproval } from "@/modules/approvals/server/actions"

const schema = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(1000).optional(), opId: opIdField })

// POST /api/mobile/v1/approvals/<code> { decision: approved|rejected, note? (needed to reject) }:
// decide a request; approving runs it in its app, as this person → { ok, message }.
// docs/mobile-api.md
export const POST = mobileRoute(async (request, access, { code }) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const result = await onceOp(access, "approvals.decide", data.opId, () => decideApproval(code, data.decision, data.note ?? ""))
  if (result.conflict) return fail("op_conflict")
  return result.ok ? json(result) : failWith(result)
})
