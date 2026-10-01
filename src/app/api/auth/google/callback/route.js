import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { GOOGLE_COOKIE as COOKIE, GOOGLE_SETUP_COOKIE, finishGoogleSignIn, isGooglePhoto } from "@/server/auth/google"
import { createWorkspace } from "@/server/tenants/create-workspace"
import { findWorkspaceInvite } from "@/server/tenants/invitations"
import { findConsoleInvite, findInvite, findMemberInvite } from "@/server/auth/invitations"
import { joinConsoleTeam } from "@/server/auth/console-team"
import { joinWorkspace } from "@/server/auth/workspace-join"
import { logAttempt } from "@/server/auth/password-check"
import { readSigned } from "@/server/auth/secrets"
import { finishSignIn } from "@/server/auth/sign-in"
import { siteForHost, siteUrl } from "@/lib/sites"

// Google sends the visitor back here with ?code=…&state=…
// In development Google can't return to a .test address, so it returns to localhost and we pass
// the same query straight on to the auth site, where the state cookie and session belong.
export async function GET(request) {
  const url = request.nextUrl
  if (siteForHost(request.headers.get("host")) !== "auth") {
    const forward = new URLSearchParams()
    for (const key of ["code", "state", "error"]) if (url.searchParams.has(key)) forward.set(key, url.searchParams.get(key))
    return NextResponse.redirect(siteUrl("auth", `/api/auth/google/callback?${forward}`))
  }

  const jar = await cookies()
  const saved = readSigned(jar.get(COOKIE)?.value)
  const setup = readSigned(jar.get(GOOGLE_SETUP_COOKIE)?.value)
  jar.set(COOKIE, "", { path: "/api/auth/google", maxAge: 0 })
  // The workspace details stay until the workspace exists, so a retry doesn't mean retyping them

  const intent = saved?.intent ?? "signin"
  const back = (error) =>
    NextResponse.redirect(
      siteUrl(
        "auth",
        intent !== "signin" && saved?.token
          ? `/${intent === "invite" ? "invite" : "setup"}/${encodeURIComponent(saved.token)}?error=${error}`
          : `/?error=${error}${saved?.redirectTo ? `&redirect=${encodeURIComponent(saved.redirectTo)}` : ""}`,
      ),
    )

  if (!saved || saved.exp < Date.now() || saved.state !== url.searchParams.get("state")) return back("google-expired")
  if (url.searchParams.get("error")) return back("google-cancelled")

  let profile
  try {
    profile = await finishGoogleSignIn({ code: url.searchParams.get("code") ?? "", verifier: saved.verifier, nonce: saved.nonce })
  } catch (err) {
    console.error("Google sign-in failed:", err.message)
    return back("google-failed")
  }

  const auth = authDb()
  const users = live(auth, "users")
  const bySub = await users.clone().where({ googleSub: profile.sub }).first("id", "name", "email", "status", "googleSub", "avatarUrl")
  const byEmail = bySub ? null : await users.clone().where({ email: profile.email }).first("id", "name", "email", "status", "googleSub", "avatarUrl")
  let user = bySub ?? byEmail
  let joinedTenantId
  // An email already linked to another Google account
  if (!bySub && byEmail?.googleSub && byEmail.googleSub !== profile.sub) {
    await logAttempt({ userId: byEmail.id, email: profile.email, success: false, reason: "google-mismatch" })
    return back("google-mismatch")
  }

  if (intent === "setup") {
    const invite = await findWorkspaceInvite(saved.token)
    if (!invite) return back("invite-gone")
    if (!setup || setup.exp < Date.now() || setup.token !== saved.token) return back("setup-expired")
    if (profile.email !== invite.email || (user && user.email !== invite.email)) return back("google-wrong-email")
    if (user && user.status !== "active") return back("disabled")
    const made = await createWorkspace({ invite, company: setup.company, person: user ?? { name: profile.name, email: profile.email, googleSub: profile.sub, avatarUrl: profile.picture } })
    if (made.field) return back("slug-taken")
    if (!made.tenant || !made.user) return back("invite-gone")
    jar.set(GOOGLE_SETUP_COOKIE, "", { path: "/", maxAge: 0 })
    if (made.error) return back("setup-failed")
    user = { ...made.user, googleSub: user?.googleSub ?? profile.sub, avatarUrl: user ? user.avatarUrl : profile.picture }
  } else if (intent === "invite") {
    // Console team or workspace invitation
    const kind = (await findInvite(saved.token))?.kind
    const invite = kind === "tenant" ? await findMemberInvite(saved.token) : kind === "console" ? await findConsoleInvite(saved.token) : null
    if (!invite) return back("invite-gone")
    if (profile.email !== invite.email || (user && user.email !== invite.email)) return back("google-wrong-email")
    if (user && user.status !== "active") return back("disabled")
    const person = user ?? { name: profile.name, email: profile.email, googleSub: profile.sub, avatarUrl: profile.picture }
    const joined = invite.kind === "tenant" ? await joinWorkspace(invite, person) : await joinConsoleTeam(invite, person)
    if (joined.error) return back("invite-gone")
    joinedTenantId = joined.tenantId
    user = { ...joined.user, googleSub: user?.googleSub ?? profile.sub, avatarUrl: user ? user.avatarUrl : profile.picture }
  } else if (!user) {
    await logAttempt({ email: profile.email, success: false, reason: "google-no-account" })
    return back("google-no-account")
  } else if (user.status !== "active") {
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: "disabled" })
    return back("disabled")
  }

  // First Google sign-in for this account: link it, and Google has verified the email
  if (!user.googleSub) {
    await auth("users")
      .where({ id: user.id })
      .whereNull("googleSub")
      .update({ googleSub: profile.sub, emailVerifiedAt: auth.raw("COALESCE(email_verified_at, ?)", [new Date()]), updatedAt: new Date() })
  }

  // Keep their Google photo current, unless they have their own photo
  if (profile.picture && user.avatarUrl !== profile.picture && (!user.avatarUrl || isGooglePhoto(user.avatarUrl))) {
    await auth("users").where({ id: user.id }).update({ avatarUrl: profile.picture, updatedAt: new Date() })
  }

  const result = await finishSignIn(user, { method: "google", remember: true, redirectTo: saved.redirectTo || undefined, tenantId: joinedTenantId })
  if (result.error) return back(result.code ?? "google-failed")
  return NextResponse.redirect(result.url)
}
