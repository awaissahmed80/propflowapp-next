import { NextResponse } from "next/server"
import { getSession } from "@/server/auth/dal"
import { serveAsset } from "@/server/assets/serve"

// GET /api/workspace/files/3fa9c0… → a workspace file for the signed-in person (rules in
// server/assets/serve.js). ?download=1 saves it instead of showing it.
export async function GET(request, { params }) {
  const session = await getSession()
  if (session?.kind !== "tenant" || !session.tenantId) return new NextResponse("Sign in first", { status: 401 })
  const { code } = await params
  return serveAsset(request, { userId: session.user.id, tenantId: session.tenantId }, code)
}
