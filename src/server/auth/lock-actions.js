"use server"

import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { endSession } from "@/server/auth/session"
import { requireTenant } from "@/server/auth/dal"
import { hashPassword, verifyPassword } from "@/server/auth/secrets"
import { AUTO_LOCK_MINUTES, UNLOCK_ATTEMPTS, getLockSettings } from "@/server/auth/screen-lock"
import { logToWorkspace } from "@/server/tenants/activity"
import { siteUrl } from "@/lib/sites"

// Screen lock for the portal: a privacy screen for short breaks, not a sign-out. The lock is
// kept on the session row (sessions.locked_at), so reloading or opening another tab stays locked
// until the passcode (or, as a fallback, the password) is entered here. 5 wrong tries end the
// session. A passcode has to be set before the screen can be locked, by hand or automatically.
// Console staff signed in as a member can't lock (they don't know the member's passcode).

const NOT_FOR_STAFF = "Screen lock isn't available while signed in as a member."
const NO_PASSCODE = "Set a passcode first, so you can unlock the screen."

export async function lockSession() {
  const s = await requireTenant("/")
  if (s.impersonatorUserId) return { error: NOT_FOR_STAFF }
  if (!s.lockedAt && !(await getLockSettings(s.user.id)).hasPasscode) return { error: NO_PASSCODE, needsPasscode: true }
  const lockedAt = s.lockedAt ?? new Date()
  if (!s.lockedAt) await authDb()("sessions").where({ id: s.id }).whereNull("lockedAt").update({ lockedAt, unlockAttempts: 0 })
  return { ok: true, lockedAt: lockedAt.toISOString() }
}

const unlockSchema = z.union([z.object({ passcode: z.string().regex(/^\d{4,6}$/) }), z.object({ password: z.string().min(1).max(256) })])

// { ok } | { error, attemptsLeft } | { signedOut, url }
export async function unlockSession(input) {
  const s = await requireTenant("/")
  if (!s.lockedAt) return { ok: true }
  const parsed = unlockSchema.safeParse(input ?? {})
  if (!parsed.success) return { error: "Enter your passcode or password." }
  const db = authDb()
  const user = await db("users").where({ id: s.user.id }).first("lockPasscodeHash", "passwordHash")
  const { passcode, password } = parsed.data
  const right = passcode != null ? await verifyPassword(user?.lockPasscodeHash, passcode) : await verifyPassword(user?.passwordHash, password)
  if (right) {
    await db("sessions").where({ id: s.id }).update({ lockedAt: null, unlockAttempts: 0 })
    return { ok: true }
  }
  await db("sessions").where({ id: s.id }).increment("unlockAttempts", 1)
  const attempts = (await db("sessions").where({ id: s.id }).first("unlockAttempts"))?.unlockAttempts ?? UNLOCK_ATTEMPTS
  if (attempts >= UNLOCK_ATTEMPTS) {
    await logToWorkspace(s.tenantId, { type: "sign-in", action: "member.signed_out", actorUserId: s.user.id, summary: "was signed out after too many wrong screen unlock attempts" })
    await endSession()
    return { signedOut: true, url: siteUrl("auth") }
  }
  const left = UNLOCK_ATTEMPTS - attempts
  return { error: `Wrong ${passcode != null ? "passcode" : "password"}. ${left} ${left === 1 ? "try" : "tries"} left before you're signed out.`, attemptsLeft: left }
}

// Settings can't be changed from a locked screen or by staff signed in as the member
async function settingsSession() {
  const s = await requireTenant("/")
  if (s.impersonatorUserId) return { error: NOT_FOR_STAFF }
  if (s.lockedAt) return { error: "Unlock the screen first." }
  return { s }
}

export async function saveLockSettings(input) {
  const { s, error } = await settingsSession()
  if (error) return { error }
  const minutes = Number(input?.autoLockMinutes)
  if (!AUTO_LOCK_MINUTES.includes(minutes)) return { error: "Choose how long to wait before locking." }
  const settings = await getLockSettings(s.user.id)
  if (minutes && !settings.hasPasscode) return { error: NO_PASSCODE }
  await authDb()("users").where({ id: s.user.id }).update({ autoLockMinutes: minutes, updatedAt: new Date(), updatedBy: s.user.id })
  return { ok: true, settings: { ...settings, autoLockMinutes: minutes } }
}

export async function setLockPasscode(code) {
  const { s, error } = await settingsSession()
  if (error) return { error }
  const value = String(code ?? "")
  if (!/^(\d{4}|\d{6})$/.test(value)) return { error: "Use 4 or 6 digits." }
  await authDb()("users")
    .where({ id: s.user.id })
    .update({ lockPasscodeHash: await hashPassword(value), lockPasscodeLength: value.length, updatedAt: new Date(), updatedBy: s.user.id })
  return { ok: true, settings: await getLockSettings(s.user.id) }
}

// Locking needs a passcode, so auto-lock goes off with it
export async function removeLockPasscode() {
  const { s, error } = await settingsSession()
  if (error) return { error }
  await authDb()("users").where({ id: s.user.id }).update({ lockPasscodeHash: null, lockPasscodeLength: null, autoLockMinutes: 0, updatedAt: new Date(), updatedBy: s.user.id })
  return { ok: true, settings: await getLockSettings(s.user.id) }
}
