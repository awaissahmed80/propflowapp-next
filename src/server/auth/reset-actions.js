"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashOtp, hashPassword, newOtp, readSigned, sameHash, signValue } from "@/server/auth/secrets"
import { requestInfo } from "@/server/auth/session"
import { logAttempt } from "@/server/auth/password-check"
import { finishSignIn } from "@/server/auth/sign-in"
import { sendEmail } from "@/server/mail/send"
import { MIN_PASSWORD } from "@/lib/password"
import { siteUrl } from "@/lib/sites"
import { logToMemberships } from "@/server/tenants/activity"

// Forgot password: 1) email a 6-digit code, 2) check the code, 3) set a new password.
// Step 2 hands back a short-lived signed ticket so step 3 doesn't need the code again.
// Nothing here reveals whether an email has an account.

const PURPOSE = "reset-password"
const CODE_MINUTES = 15
const MAX_TRIES = 5
const RESEND_SECONDS = 60
const MAX_PER_EMAIL_HOUR = 5
const MAX_PER_IP_HOUR = 20
const TICKET_MINUTES = 10

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."))
const WRONG_CODE = "That code isn't right or has expired. Check the latest email, or send a new code."

// Step 1. Always answers the same way; the email goes out after the response, so timing
// doesn't give away which emails have accounts. Returns { ok, email, resendIn } or { error }.
export async function requestResetCode(rawEmail) {
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message } }
  const email = parsed.data
  const db = authDb()
  const { ip } = await requestInfo()
  const hourAgo = new Date(Date.now() - 3_600_000)

  const [byIp, recent] = await Promise.all([
    ip ? db("oneTimeCodes").where({ ip, purpose: PURPOSE }).where("createdAt", ">", hourAgo).count({ n: "*" }).first() : { n: 0 },
    db("oneTimeCodes").where({ email, purpose: PURPOSE }).where("createdAt", ">", hourAgo).orderBy("id", "desc").select("createdAt"),
  ])
  if (Number(byIp.n) >= MAX_PER_IP_HOUR) return { error: "Too many reset requests from this network. Please try again in an hour." }
  // Too soon or too many for this email: answer as if sent (the last code still works)
  const last = recent[0]?.createdAt
  const wait = last ? Math.ceil((last.getTime() + RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0
  if (wait > 0 || recent.length >= MAX_PER_EMAIL_HOUR) return { ok: true, email, resendIn: Math.max(wait, 0) || RESEND_SECONDS }

  const user = await live(db, "users").where({ email }).first("id", "name", "status", "passwordHash", "googleSub")
  if (!user || user.status !== "active") {
    // Record the request so the limits above apply to unknown emails too
    await db("oneTimeCodes").insert({ email, purpose: PURPOSE, codeHash: hashOtp(newOtp()), expiresAt: new Date(), consumedAt: new Date(), ip })
    return { ok: true, email, resendIn: RESEND_SECONDS }
  }

  const code = newOtp()
  // Only the newest code works
  await db("oneTimeCodes").where({ userId: user.id, purpose: PURPOSE }).whereNull("consumedAt").update({ consumedAt: new Date() })
  await db("oneTimeCodes").insert({ userId: user.id, email, purpose: PURPOSE, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000), ip })

  const data = { name: user.name, code, minutes: CODE_MINUTES, ip, requested_at: new Date(), google_only: !user.passwordHash && Boolean(user.googleSub) }
  after(() => sendEmail("reset-code", { to: email, data }))
  return { ok: true, email, resendIn: RESEND_SECONDS }
}

// Step 2. Returns { ticket } for step 3, or { error }
export async function verifyResetCode(rawEmail, rawCode) {
  const email = emailSchema.safeParse(rawEmail).data
  const code = String(rawCode ?? "").replace(/\D/g, "")
  if (!email || code.length !== 6) return { error: "Enter the 6-digit code from the email." }

  const db = authDb()
  const row = await db("oneTimeCodes")
    .where({ email, purpose: PURPOSE })
    .whereNotNull("userId")
    .whereNull("consumedAt")
    .where("expiresAt", ">", new Date())
    .orderBy("id", "desc")
    .first("id", "userId", "codeHash", "attempts")
  if (!row) return { error: WRONG_CODE }

  if (!sameHash(row.codeHash, hashOtp(code))) {
    const attempts = row.attempts + 1
    // Too many wrong guesses: this code stops working
    await db("oneTimeCodes").where({ id: row.id }).update({ attempts, ...(attempts >= MAX_TRIES ? { consumedAt: new Date() } : {}) })
    await logAttempt({ userId: row.userId, email, success: false, reason: "reset-bad-code" })
    return { error: attempts >= MAX_TRIES ? "Too many wrong codes. Send a new code to try again." : WRONG_CODE }
  }
  return { ticket: signValue({ codeId: row.id, userId: row.userId, email, exp: Date.now() + TICKET_MINUTES * 60_000 }) }
}

const passwordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128, "That's too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })

// Step 3. Sets the password, signs every other browser out, emails a notice, and signs in.
// Returns { fieldErrors } / { error } / { done: true } (signed in elsewhere), or redirects.
export async function setNewPassword(ticketValue, input) {
  const ticket = readSigned(ticketValue)
  if (!ticket || ticket.exp < Date.now()) return { error: "This reset took too long. Start again to get a new code.", restart: true }
  const parsed = passwordSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }

  const db = authDb()
  const passwordHash = await hashPassword(parsed.data.password)
  // Use the code up; if it was already used (or replaced), stop
  const used = await db("oneTimeCodes").where({ id: ticket.codeId, userId: ticket.userId }).whereNull("consumedAt").update({ consumedAt: new Date() })
  if (!used) return { error: "This code was already used. Start again to get a new one.", restart: true }

  const now = new Date()
  await db("users")
    .where({ id: ticket.userId })
    .update({
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      // Reading the code proved the address
      emailVerifiedAt: db.raw("COALESCE(email_verified_at, ?)", [now]),
      updatedAt: now,
    })
  await db("sessions").where({ userId: ticket.userId }).whereNull("revokedAt").update({ revokedAt: now })
  await logToMemberships(ticket.userId, { type: "security", action: "member.password_reset", summary: "reset their password with an emailed code" })
  await logAttempt({ userId: ticket.userId, email: ticket.email, success: true, reason: "password-reset" })

  const user = await live(db, "users").where({ id: ticket.userId }).first("id", "name", "email", "status")
  const { ip } = await requestInfo()
  after(() => sendEmail("password-changed", { to: user.email, data: { name: user.name, ip, changed_at: now, reset_url: siteUrl("auth", "/forgot-password") } }))

  if (user.status !== "active") return { done: true }
  const result = await finishSignIn(user, { method: "password", remember: false })
  // Not console staff (workspaces come with the portal): password is set, they sign in later
  if (result.error) return { done: true }
  redirect(result.url)
}
