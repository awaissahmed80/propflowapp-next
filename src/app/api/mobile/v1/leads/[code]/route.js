import { z } from "zod"
import { appClosed, fail, failWith, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { crmContext } from "@/modules/crm/server/context"
import { getLead } from "@/modules/crm/server/queries"
import { updateLead } from "@/modules/crm/server/leads"

// /api/workspace/files/<code> → this API's /api/mobile/v1/files/<code>: a path the app joins to the
// API's own origin (behind the proxy the server's request URL isn't the address the phone uses)
const mobileFilePath = (url) => url.replace("/api/workspace/files/", "/api/mobile/v1/files/")

// GET /api/mobile/v1/leads/<code>: one lead with its planned items and history (as the web's lead
// panel) → { lead }. PATCH { lead: { …fields to change }, opId? }: change its details; fields left
// out keep their values → { ok }. docs/mobile-api.md
export const GET = mobileRoute(async (request, access, { code }) => {
  const ctx = await crmContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const lead = await getLead(ctx, code)
  if (!lead) return fail("not_found", { message: "That lead was removed or isn't yours to see." })
  // Voice notes play from the mobile API (bearer sign-in), not the portal's cookie-only file route
  const voice = (a) => (a.voice ? { ...a, voice: { ...a.voice, url: mobileFilePath(a.voice.url) } } : a)
  return json({ lead: { ...lead, planned: lead.planned?.map(voice), history: lead.history?.map(voice) }, can: { edit: ctx.can("edit"), reassign: ctx.canReassign } })
})

const schema = z.object({ lead: z.record(z.string(), z.unknown()), opId: opIdField })
export const PATCH = mobileRoute(async (request, access, { code }) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ctx = await crmContext()
  const current = await getLead(ctx, code)
  if (!current) return fail("not_found", { message: "That lead was removed or isn't yours to see." })
  // The web form sends every field: start from the lead as it is
  const i = current.interest
  const base = {
    name: current.name,
    phone: current.phone,
    whatsapp: current.whatsapp,
    email: current.email ?? "",
    city: current.city ?? "",
    overseas: current.overseas,
    source: current.source ?? "",
    priority: current.priority ?? "moderate",
    projectCode: i.project?.code ?? "",
    unitType: i.unitType ?? "",
    sizeValue: i.sizeValue,
    sizeUnit: i.sizeUnit,
    budgetMin: i.budgetMin,
    budgetMax: i.budgetMax,
    paymentPlan: i.paymentPlan,
    purpose: i.purpose,
    notes: current.notes ?? "",
  }
  const result = await onceOp(access, "leads.update", data.opId, () => updateLead(code, { ...base, ...data.lead }))
  if (result.conflict) return fail("op_conflict")
  return result.ok ? json(result) : failWith(result)
})
