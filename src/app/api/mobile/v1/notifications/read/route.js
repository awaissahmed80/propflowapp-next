import { z } from "zod"
import { json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { markNotificationsRead } from "@/modules/portal/server/notifications"

const schema = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() })

// POST /api/mobile/v1/notifications/read { ids? }: mark these read (none given: all of them)
// → { ok }. docs/mobile-api.md
export const POST = mobileRoute(async (request) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  return json(await markNotificationsRead(data.ids ?? []))
})
