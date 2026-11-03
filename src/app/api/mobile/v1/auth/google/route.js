import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { isGooglePhoto } from "@/server/auth/google"
import { mobileGoogleEnabled, verifyGoogleIdToken } from "@/server/auth/google-id-token"
import { logAttempt } from "@/server/auth/password-check"
import { clientIp } from "@/server/auth/mobile-session"
import { deviceField, fail, json, publicRoute, readBody, signInLimited } from "@/modules/mobile/server/api"
import { afterIdentity } from "@/modules/mobile/server/sign-in"

const schema = z.object({ idToken: z.string().min(20).max(4096), device: deviceField })

// POST /api/mobile/v1/auth/google { idToken, device }: Google signed in on the phone; we check the
// ID token's signature and claims (google-id-token.js), then follow the web's Google callback: an
// existing account only (by Google id, else by email), linked on first use. docs/mobile-api.md
export const POST = publicRoute(async (request) => {
  if (!mobileGoogleEnabled()) return fail("google_unavailable")
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ip = clientIp(request)
  if (signInLimited(ip, null)) return fail("too_many")

  let profile
  try {
    profile = await verifyGoogleIdToken(data.idToken)
  } catch (err) {
    console.error("Mobile Google sign-in refused:", err.message)
    return fail("google_invalid")
  }
  if (signInLimited(ip, profile.email)) return fail("too_many")

  const auth = authDb()
  const users = live(auth, "users")
  const columns = ["id", "name", "email", "status", "googleSub", "avatarUrl"]
  const bySub = await users.clone().where({ googleSub: profile.sub }).first(columns)
  const byEmail = bySub ? null : await users.clone().where({ email: profile.email }).first(columns)
  const user = bySub ?? byEmail
  if (!bySub && byEmail?.googleSub && byEmail.googleSub !== profile.sub) {
    await logAttempt({ userId: byEmail.id, email: profile.email, success: false, reason: "google-mismatch" })
    return fail("google_mismatch")
  }
  if (!user) {
    await logAttempt({ email: profile.email, success: false, reason: "google-no-account" })
    return fail("google_not_linked")
  }
  if (user.status !== "active") {
    await logAttempt({ userId: user.id, email: user.email, success: false, reason: "disabled" })
    return fail("inactive")
  }
  // First Google sign-in for this account: link it (Google has verified the email)
  if (!user.googleSub) await auth("users").where({ id: user.id }).whereNull("googleSub").update({ googleSub: profile.sub, updatedAt: new Date() })
  // Keep their Google photo current, unless they have their own photo
  if (profile.picture && user.avatarUrl !== profile.picture && (!user.avatarUrl || isGooglePhoto(user.avatarUrl))) {
    await auth("users").where({ id: user.id }).update({ avatarUrl: profile.picture, updatedAt: new Date() })
  }
  const result = await afterIdentity(user, { method: "google", device: data.device, ip })
  return result.error ? fail(result.error, { values: result.values }) : json(result)
})
