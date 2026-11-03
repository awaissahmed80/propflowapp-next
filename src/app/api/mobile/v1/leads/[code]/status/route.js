import { z } from "zod"
import { fail, failWith, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { setLeadStatus } from "@/modules/crm/server/leads"

const schema = z.object({ status: z.string().min(1).max(40), lossReason: z.string().max(40).optional(), note: z.string().max(2000).optional(), opId: opIdField })

// POST /api/mobile/v1/leads/<code>/status { status, lossReason?, note? }: move the lead along
// (lost needs lossReason; a note when Settings › CRM asks for one) → { ok }. docs/mobile-api.md
export const POST = mobileRoute(async (request, access, { code }) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const result = await onceOp(access, "leads.status", data.opId, () => setLeadStatus(code, data.status, { lossReason: data.lossReason, note: data.note ?? "" }))
  if (result.conflict) return fail("op_conflict")
  return result.ok ? json(result) : failWith(result)
})
