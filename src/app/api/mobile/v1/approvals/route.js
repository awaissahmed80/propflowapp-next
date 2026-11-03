import { json, mobileRoute } from "@/modules/mobile/server/api"
import { deskContext } from "@/modules/desk/server/context"
import { listApprovals } from "@/modules/approvals/server/queries"

// GET /api/mobile/v1/approvals: the requests inbox → { waiting (for this person to decide), mine
// (what they asked for), decided (by them) }. docs/mobile-api.md
export const GET = mobileRoute(async () => json(await listApprovals(await deskContext("/approvals"))))
