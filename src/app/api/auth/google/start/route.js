import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { GOOGLE_COOKIE as COOKIE, googleEnabled, startGoogleSignIn } from "@/server/auth/google"
import { findConsoleInvite } from "@/server/auth/invitations"
import { findWorkspaceInvite } from "@/server/tenants/invitations"
import { signValue } from "@/server/auth/secrets"
import { siteForHost, siteUrl } from "@/lib/sites"

// GET /api/auth/google/start?intent=signin&redirect=…  |  ?intent=invite&token=…  |  ?intent=setup&token=…
// Remembers what the visitor was doing in a short-lived signed cookie, then sends them to Google.

export async function GET(request) {
  const url = request.nextUrl
  // Always start on the auth site, where the session cookie is set at the end
  if (siteForHost(request.headers.get("host")) !== "auth") return NextResponse.redirect(siteUrl("auth", `/api/auth/google/start${url.search}`))

  const intent = ["invite", "setup"].includes(url.searchParams.get("intent")) ? url.searchParams.get("intent") : "signin"
  const token = url.searchParams.get("token") ?? ""
  const redirectTo = url.searchParams.get("redirect") ?? ""
  const pages = { invite: `/invite/${encodeURIComponent(token)}`, setup: `/setup/${encodeURIComponent(token)}`, signin: "/" }
  const back = (error) => NextResponse.redirect(siteUrl("auth", `${pages[intent]}?error=${error}`))

  if (!googleEnabled()) return back("google-off")
  let loginHint
  if (intent !== "signin") {
    const invite = intent === "invite" ? await findConsoleInvite(token) : await findWorkspaceInvite(token)
    if (!invite) return back("invite-gone")
    loginHint = invite.email
  }

  const { url: googleUrl, secrets } = startGoogleSignIn({ loginHint })
  const jar = await cookies()
  jar.set(COOKIE, signValue({ ...secrets, intent, token, redirectTo: redirectTo.slice(0, 2000), exp: Date.now() + 10 * 60_000 }), {
    httpOnly: true,
    secure: (process.env.APP_PROTOCOL || "https") === "https",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  })
  return NextResponse.redirect(googleUrl)
}
