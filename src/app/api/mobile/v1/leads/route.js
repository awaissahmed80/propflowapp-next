import { z } from "zod"
import { appClosed, failWith, fail, json, listParam, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { onceOp, opIdField } from "@/modules/mobile/server/ops"
import { crmContext } from "@/modules/crm/server/context"
import { pageLeads } from "@/modules/crm/server/queries"
import { createLead } from "@/modules/crm/server/leads"

// GET /api/mobile/v1/leads?tab=open|due|booked|lost|archived&q=&status=a,b&source=&priority=
//   &project=<codes|none>&agent=<ids|none>&sort=name|status|next|added&dir=asc|desc&page=&size=
// One page of the leads this person may see, as on the web list
// → { rows, total, page, size, counts, overdue, any, scoring }.
// POST { lead: { name, phone, … }, force?, opId? }: add a lead → { ok, code }; an open lead on the
// same mobile → 409 duplicate with { duplicate: [...] } (send force: true to add it anyway).
// docs/mobile-api.md
export const GET = mobileRoute(async (request) => {
  const ctx = await crmContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const sp = new URL(request.url).searchParams
  const data = await pageLeads(ctx, {
    q: (sp.get("q") ?? "").slice(0, 100),
    status: listParam(sp, "status"),
    source: listParam(sp, "source"),
    priority: listParam(sp, "priority"),
    project: listParam(sp, "project").map((c) => (c === "none" ? c : c.toUpperCase())),
    agent: listParam(sp, "agent"),
    tab: sp.get("tab") ?? "open",
    sort: sp.get("sort"),
    dir: sp.get("dir"),
    page: sp.get("page"),
    size: sp.get("size"),
  })
  return json(data)
})

const schema = z.object({ lead: z.record(z.string(), z.unknown()), force: z.boolean().optional(), opId: opIdField })
export const POST = mobileRoute(async (request, access) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const result = await onceOp(access, "leads.create", data.opId, () => createLead(data.lead, { force: Boolean(data.force) }))
  if (result.conflict) return fail("op_conflict")
  if (result.duplicate) return json({ error: { code: "duplicate", message: "There's already an open lead with this mobile." }, duplicate: result.duplicate }, 409)
  return result.ok ? json(result) : failWith(result)
})
