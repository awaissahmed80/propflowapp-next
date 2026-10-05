import { after } from "next/server"
import { receiveWebhook } from "@/modules/campaigns/server/meta"
import { validSignature } from "@/modules/campaigns/meta/graph"

// Meta's webhook for lead ads, one address for every workspace (set in the Meta app under
// Webhooks › Page › leadgen): https://<any PropFlow host>/api/meta/webhook
//   GET: Meta checks the address once with META_WEBHOOK_VERIFY_TOKEN
//   POST: a new lead. Signed with the app secret; answered at once (Meta retries slow or failed
//   deliveries), and the lead is fetched and added right after.

export async function GET(request) {
  const q = request.nextUrl.searchParams
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) return new Response(q.get("hub.challenge") ?? "", { status: 200 })
  return new Response("Forbidden", { status: 403 })
}

export async function POST(request) {
  const raw = await request.text()
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 })
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return new Response("Bad request", { status: 400 })
  }
  after(() => receiveWebhook(payload).catch((err) => console.error("Meta webhook failed:", err)))
  return new Response("OK", { status: 200 })
}
