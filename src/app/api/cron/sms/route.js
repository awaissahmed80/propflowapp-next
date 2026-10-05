import crypto from "node:crypto"
import { runAllSmsAutomation } from "@/server/sms-automation"

// GET /api/cron/sms with "Authorization: Bearer <CRON_SECRET>", every 15 minutes from the server's
// scheduler: automatic SMS for every workspace that has them on (installment reminders once a day,
// payment received as payments clear), only between 9 am and 8 pm Pakistan time.
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret ?? ""}`)
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 })
  return Response.json({ ok: true, workspaces: await runAllSmsAutomation() })
}
