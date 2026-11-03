import { z } from "zod"
import { clientIp } from "@/server/auth/mobile-session"
import { fail, json, publicRoute, readBody, stepLimited, ticketField } from "@/modules/mobile/server/api"
import { chooseWorkspace, readTicket } from "@/modules/mobile/server/sign-in"

const schema = z.object({ ticket: ticketField, workspaceKey: z.string().min(3).max(20) })

// POST /api/mobile/v1/auth/choose { ticket, workspaceKey }: open one of the workspaces the
// chooser offered. docs/mobile-api.md
export const POST = publicRoute(async (request) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ip = clientIp(request)
  if (stepLimited(ip)) return fail("too_many")
  const t = await readTicket(data.ticket, "choose")
  if (!t) return fail("ticket_expired")
  const result = await chooseWorkspace(t, data.workspaceKey, { method: t.m, device: t.d, ip })
  return result.error ? fail(result.error, { field: result.error === "no_access" ? "workspaceKey" : undefined, values: result.values }) : json(result)
})
