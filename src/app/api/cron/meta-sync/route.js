import crypto from "node:crypto"
import { syncDueWorkspaces } from "@/modules/campaigns/server/meta"

// GET /api/cron/meta-sync with "Authorization: Bearer <CRON_SECRET>", every 15 minutes from the
// server's scheduler: fetches lead ads Meta's webhook missed, for workspaces whose lead settings
// ask for a check (every 15 minutes, hourly or daily) that's due.
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret ?? ""}`)
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 })
  const checked = await syncDueWorkspaces()
  return Response.json({ ok: true, checked })
}
