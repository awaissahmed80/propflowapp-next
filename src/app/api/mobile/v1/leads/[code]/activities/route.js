import { z } from "zod"
import { fail, failWith, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { logLeadActivity, planLeadActivity, updatePlannedActivity } from "@/modules/crm/server/leads"

// JSON, or multipart with the JSON in "data" and a voice note in "voice" → { data, form } or { response }
async function readForm(request, schema) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return readBody(request, schema)
  const form = await request.formData().catch(() => null)
  let raw = null
  try {
    raw = JSON.parse(String(form?.get("data") ?? ""))
  } catch {}
  const parsed = schema.safeParse(raw ?? {})
  if (parsed.success) return { data: parsed.data, form }
  const field = parsed.error.issues[0]?.path.join(".")
  return { response: fail("invalid", { field: field || undefined, message: `Check ${field || "the request"}.` }) }
}

const text = (max) => z.string().max(max).optional()
const fields = {
  type: text(40),
  outcome: text(60),
  notes: text(4000),
  next: text(40),
  nextType: text(40),
  nextTime: text(5),
  opId: opIdField,
}

// POST /api/mobile/v1/leads/<code>/activities
//   { kind: "log", type, outcome?, notes?, next?, nextType?, nextTime?, statusTo?, lossReason?, projectCode? }
//     something that happened just now (completes what was due) → { ok, status }
//   { kind: "plan", type, at ("yyyy-MM-ddTHH:mm", Pakistan time) or next (a Follow-up option), notes?, projectCode? }
//     a follow-up or site visit → { ok }
// PATCH { id, action: done|reschedule|missed|cancel, outcome?, notes?, next?, nextType?, nextTime? }:
//   a planned item (its id from GET /leads/<code>) → { ok }.
// A log (and PATCH done) may carry a voice note: send multipart/form-data with the JSON above in a
// "data" field and the recording (m4a/webm/ogg, up to 5 MB) in "voice". docs/mobile-api.md
const postSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("log"), ...fields, type: z.string().min(1).max(40), statusTo: text(40), lossReason: text(40), projectCode: text(12) }),
  z.object({ kind: z.literal("plan"), ...fields, type: z.string().min(1).max(40), at: text(16), projectCode: text(12) }),
])
export const POST = mobileRoute(async (request, access, { code }) => {
  const { data, form, response } = await readForm(request, postSchema)
  if (response) return response
  const { kind, opId, ...input } = data
  const result = await onceOp(access, `activities.${kind}`, opId, () => (kind === "log" ? logLeadActivity(code, input, form) : planLeadActivity(code, input)))
  if (result.conflict) return fail("op_conflict")
  return result.ok ? json(result) : failWith(result)
})

const patchSchema = z.object({ id: z.number().int().positive(), action: z.enum(["done", "reschedule", "missed", "cancel"]), ...fields })
export const PATCH = mobileRoute(async (request, access, { code }) => {
  const { data, form, response } = await readForm(request, patchSchema)
  if (response) return response
  const { id, opId, ...input } = data
  const result = await onceOp(access, "activities.update", opId, () => updatePlannedActivity(code, id, input, form))
  if (result.conflict) return fail("op_conflict")
  return result.ok ? json(result) : failWith(result)
})
