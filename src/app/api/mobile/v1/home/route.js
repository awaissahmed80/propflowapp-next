import { json, mobileRoute } from "@/modules/mobile/server/api"
import { deskContext } from "@/modules/desk/server/context"
import { deskSummary } from "@/modules/desk/server/summary"

// GET /api/mobile/v1/home: My Desk → { me, counts, critical, tasks, approvals, recent }. Tasks'
// hrefs are portal paths; the app opens the ones it has screens for. docs/mobile-api.md
export const GET = mobileRoute(async () => {
  const ctx = await deskContext("/")
  return json(await deskSummary(ctx))
})
