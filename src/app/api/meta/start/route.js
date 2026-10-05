import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { campaignsContext } from "@/modules/campaigns/server/context"
import { META_COOKIE, META_RETURN, metaEnabled, metaLoginUrl } from "@/modules/campaigns/meta/graph"
import { signValue } from "@/server/auth/secrets"
import { integrationOn } from "@/server/integrations"
import { siteUrl } from "@/lib/sites"

// GET /api/meta/start?from=campaigns|settings (the "Connect Facebook" button): someone who may change Campaigns, in a
// workspace with lead ads, goes to Facebook Login. A short-lived signed cookie remembers the
// workspace and person, so the callback only finishes the connection they started.
export async function GET(request) {
  const from = META_RETURN[request.nextUrl.searchParams.get("from")] ? request.nextUrl.searchParams.get("from") : "campaigns"
  const ctx = await campaignsContext(META_RETURN[from])
  const back = (error) => NextResponse.redirect(siteUrl("portal", `${META_RETURN[from]}?meta=${error}`))
  if (!ctx.can("edit")) return back("not-allowed")
  if (!ctx.has("lead-ads")) return back("not-in-plan")
  if (!metaEnabled()) return back("not-configured")
  if (!(await integrationOn(ctx.tenant.id, "meta"))) return back("turned-off")
  if (ctx.session.impersonatorUserId) return back("not-for-staff")

  const state = crypto.randomBytes(24).toString("base64url")
  const jar = await cookies()
  jar.set(META_COOKIE, signValue({ state, from, tenantId: ctx.tenant.id, userId: ctx.user.id, exp: Date.now() + 10 * 60_000 }), {
    httpOnly: true,
    secure: (process.env.APP_PROTOCOL || "https") === "https",
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  })
  return NextResponse.redirect(metaLoginUrl(state))
}
