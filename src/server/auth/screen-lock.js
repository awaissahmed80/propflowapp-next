import "server-only"
import { authDb } from "@/server/db/connections"

// Screen lock settings of an account, safe to send to the browser (no hashes):
// { autoLockMinutes, hasPasscode, passcodeLength, hasPassword }
// Locking needs a passcode; the password only stands in for it on the lock screen.
// hasPassword: false for people who only sign in with Google.
export const AUTO_LOCK_MINUTES = [0, 5, 10, 15, 30, 60]
export const UNLOCK_ATTEMPTS = 5

export async function getLockSettings(userId) {
  const u = await authDb()("users").where({ id: userId }).first("lockPasscodeHash", "lockPasscodeLength", "autoLockMinutes", "passwordHash")
  return {
    autoLockMinutes: u?.lockPasscodeHash ? (u.autoLockMinutes ?? 0) : 0,
    hasPasscode: Boolean(u?.lockPasscodeHash),
    passcodeLength: u?.lockPasscodeHash ? (u.lockPasscodeLength ?? 4) : null,
    hasPassword: Boolean(u?.passwordHash),
  }
}
