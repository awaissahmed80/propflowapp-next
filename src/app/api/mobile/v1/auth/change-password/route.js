import { z } from "zod"
import { clientIp } from "@/server/auth/mobile-session"
import { fail, json, passwordField, publicRoute, readBody, stepLimited, ticketField } from "@/modules/mobile/server/api"
import { changePasswordStep, readTicket } from "@/modules/mobile/server/sign-in"

const schema = z.object({ ticket: ticketField, password: passwordField })

// POST /api/mobile/v1/auth/change-password { ticket, password }: a temporary password is replaced
// before going on (to the chooser or the session). docs/mobile-api.md
export const POST = publicRoute(async (request) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ip = clientIp(request)
  if (stepLimited(ip)) return fail("too_many")
  const t = await readTicket(data.ticket, "change_password")
  if (!t) return fail("ticket_expired")
  const result = await changePasswordStep(t, data.password, { method: t.m, device: t.d, ip })
  return result.error ? fail(result.error, { field: result.error.startsWith("password") ? "password" : undefined, values: result.values }) : json(result)
})
