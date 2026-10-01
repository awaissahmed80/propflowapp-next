import "server-only"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashPassword, verifyPassword } from "@/server/auth/secrets"
import { requestInfo } from "@/server/auth/session"

// The one place passwords are checked, with brute-force protection:
// 5 wrong passwords pause the account for 15 minutes. Used by sign-in and by
// "accept an invitation with your existing account".

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15
export const BAD_LOGIN = "That email and password don't match. Check them and try again."

// Unknown emails still pay for a password check, so timing doesn't reveal which emails exist
let dummyHash
const dummy = async () => (dummyHash ??= await hashPassword("not-a-real-password"))

export async function logAttempt({ userId = null, email, success, reason, tenantId = null }) {
  const { ip, userAgent } = await requestInfo()
  await authDb()("loginHistory").insert({ userId, email, success, reason, tenantId, ip, userAgent })
}

// { user } when the password is right and the account is active, otherwise { error }.
// Every outcome is written to login_history.
export async function checkPassword(email, password) {
  const db = authDb()
  const user = await live(db, "users").where({ email }).first("id", "name", "email", "passwordHash", "status", "failedAttempts", "lockedUntil")
  if (!user) {
    await verifyPassword(await dummy(), password)
    await logAttempt({ email, success: false, reason: "unknown-email" })
    return { error: BAD_LOGIN }
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60_000)
    await logAttempt({ userId: user.id, email, success: false, reason: "locked" })
    return { error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.` }
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    const attempts = user.failedAttempts + 1
    const lock = attempts >= MAX_ATTEMPTS
    await db("users")
      .where({ id: user.id })
      .update({ failedAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
    await logAttempt({ userId: user.id, email, success: false, reason: "bad-password" })
    return { error: lock ? `Too many wrong attempts. Sign-in is paused for ${LOCK_MINUTES} minutes.` : BAD_LOGIN }
  }
  // Right password from here on, so it's safe to say what's wrong with the account
  if (user.status !== "active") {
    await logAttempt({ userId: user.id, email, success: false, reason: "disabled" })
    return { error: "This account has been disabled. Contact your administrator." }
  }
  return { user }
}

// After a successful sign-in. reason: "ok" (password) or "ok-google"
export async function recordLogin(user, reason = "ok") {
  await authDb()("users").where({ id: user.id }).update({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
  await logAttempt({ userId: user.id, email: user.email, success: true, reason })
}
