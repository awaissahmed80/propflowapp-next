import { NextResponse } from "next/server"
import { demoPeople, readDemoState } from "@/server/tenants/demo-workspace"
import { DEMO } from "@/server/tenants/demo-workspace/seed"
import { json, onAuthHost } from "@/modules/mobile/server/api"

// GET /api/mobile/v1/dev/demo-accounts: development only. The app's sign-in screen lists the demo
// workspace's sign-ins (one per role) in dev builds; one tap fills in the email and password.
// Production (APP_ENV=production) and no ready demo workspace answer 404.
export async function GET(request) {
  if (process.env.APP_ENV === "production" || !onAuthHost(request)) return new NextResponse(null, { status: 404 })
  const state = await readDemoState()
  if (state?.status !== "ready" || !state.password) return new NextResponse(null, { status: 404 })
  return json({ workspace: DEMO.company, password: state.password, people: demoPeople().map((p) => ({ name: p.name, email: p.email, role: p.label })) })
}
