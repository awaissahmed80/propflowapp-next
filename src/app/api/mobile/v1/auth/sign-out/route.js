import { endMobileSession } from "@/server/auth/mobile-session"
import { json, mobileRoute } from "@/modules/mobile/server/api"

// POST /api/mobile/v1/auth/sign-out: this phone's token stops working (and its pushes stop).
// docs/mobile-api.md
export const POST = mobileRoute(async (request, access) => {
  await endMobileSession(access.session.id)
  return json({ ok: true })
})
