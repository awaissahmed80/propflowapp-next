import crypto from "node:crypto"
import { platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { readSms, receiveDlr } from "@/server/sms"

// Delivery reports from a workspace's SMS provider: https://portal.<root>/api/sms/dlr/<workspace
// code>/<token>, the address shown in Settings › Integrations › SMS gateway. The token proves it's
// that workspace's provider; reports for unknown messages are ignored. Always answers 200 for a
// valid address so the provider doesn't keep retrying.

const same = (a, b) => {
  const x = Buffer.from(String(a ?? ""))
  const y = Buffer.from(String(b ?? ""))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

async function handle(request, params, payload) {
  const { tenant: code, token } = await params
  const tenant = await live(platformDb(), "tenants")
    .where({ code: String(code).toUpperCase() })
    .whereIn("status", ["trial", "active", "past_due"])
    .first("id", "code", "dbName", "dbHost")
  if (!tenant) return new Response("Not found", { status: 404 })
  const db = tenantDb(tenant)
  const s = await readSms(db)
  if (!s || !same(s.webhookToken, token)) return new Response("Not found", { status: 404 })
  const reports = Array.isArray(payload) ? payload : [payload]
  for (const p of reports) await receiveDlr(db, s.provider, p).catch((err) => console.error("SMS delivery report:", err.message))
  return Response.json({ ok: true })
}

export async function POST(request, { params }) {
  const type = request.headers.get("content-type") ?? ""
  const payload = type.includes("json") ? await request.json().catch(() => ({})) : Object.fromEntries(new URLSearchParams(await request.text()))
  return handle(request, params, payload)
}

// Some providers report with a GET and query parameters
export async function GET(request, { params }) {
  return handle(request, params, Object.fromEntries(request.nextUrl.searchParams))
}
