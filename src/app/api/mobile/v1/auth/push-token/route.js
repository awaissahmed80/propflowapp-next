import { z } from "zod"
import { setPushToken } from "@/server/auth/mobile-session"
import { json, mobileRoute, readBody } from "@/modules/mobile/server/api"

const schema = z.object({
  pushToken: z
    .string()
    .trim()
    .max(255)
    .regex(/^[\x21-\x7e]*$/)
    .nullable(),
})

// POST /api/mobile/v1/auth/push-token { pushToken }: the phone's FCM token (null: no pushes).
// docs/mobile-api.md
export const POST = mobileRoute(async (request, access) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  await setPushToken(access.session.id, data.pushToken || null)
  return json({ ok: true })
})
