import { NextResponse } from "next/server"
import { requireTenant } from "@/server/auth/dal"
import { tenantDb } from "@/server/db/connections"

// The bell's unread count, polled by the portal header. A plain GET rather than a server action,
// so a slow poll never queues ahead of what the person clicks. Signed out → a redirect to sign in.
export async function GET() {
  const s = await requireTenant("/")
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const r = await db("notifications").where({ userId: s.user.id }).whereNull("readAt").count({ n: "id" }).first()
  return NextResponse.json({ unread: Number(r?.n ?? 0) }, { headers: { "Cache-Control": "private, no-store" } })
}
