import { NextResponse } from "next/server"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { redeemHandoff } from "@/server/auth/desktop-handoff"
import { finishSignIn } from "@/server/auth/sign-in"
import { siteForHost, siteUrl } from "@/lib/sites"

// GET /api/auth/desktop/redeem?code=…&verifier=… : opened by the desktop app with the code the
// browser handed it after Google sign-in (see server/auth/desktop-handoff.js). Signs the app in.
export async function GET(request) {
  const url = request.nextUrl
  // The session cookie belongs to the auth site
  if (siteForHost(request.headers.get("host")) !== "auth") return NextResponse.redirect(siteUrl("auth", `/api/auth/desktop/redeem${url.search}`))
  const back = (error) => NextResponse.redirect(siteUrl("auth", `/?error=${error}`))

  const userId = await redeemHandoff(url.searchParams.get("code"), url.searchParams.get("verifier"))
  if (!userId) return back("desktop-expired")
  const user = await live(authDb(), "users").where({ id: userId }).first("id", "name", "email", "status")
  if (!user) return back("desktop-expired")
  if (user.status !== "active") return back("disabled")

  const result = await finishSignIn(user, { method: "google", remember: true })
  if (result.error) return back(result.code ?? "google-failed")
  return NextResponse.redirect(result.url)
}
