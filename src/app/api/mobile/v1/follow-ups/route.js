import { appClosed, json, mobileRoute } from "@/modules/mobile/server/api"
import { crmContext } from "@/modules/crm/server/context"
import { plannedWork } from "@/modules/crm/server/queries"

const KINDS = ["follow-ups", "site-visits", "meetings"]

// GET /api/mobile/v1/follow-ups?kind=follow-ups|site-visits|meetings&mine=1: planned work on open
// leads (and what was done in the last 30 days), soonest first → { items }. mine=1: only this
// person's. docs/mobile-api.md
export const GET = mobileRoute(async (request, access) => {
  const ctx = await crmContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const sp = new URL(request.url).searchParams
  const kind = KINDS.includes(sp.get("kind")) ? sp.get("kind") : "follow-ups"
  const items = await plannedWork(ctx, kind)
  return json({ items: sp.get("mine") === "1" ? items.filter((x) => x.by?.id === access.user.id) : items })
})
