"use server"

import { after } from "next/server"
import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { getSession } from "@/server/auth/dal"
import { requestInfo } from "@/server/auth/session"
import { hashPassword, verifyPassword } from "@/server/auth/secrets"
import { deleteFile, saveFile } from "@/server/storage"
import { sendEmail } from "@/server/mail/send"
import { logToMemberships } from "@/server/tenants/activity"
import { MIN_PASSWORD } from "@/lib/password"
import { siteUrl } from "@/lib/sites"
import { avatarKey, avatarUrl } from "@/server/auth/avatars"

// My Desk › Profile: your own account, the same in every workspace: name, photo, password and the
// browsers you're signed in on. Never while console staff are signed in as you.

async function me() {
  const s = await getSession()
  if (!s?.user) return { error: "Please sign in again." }
  if (s.impersonatorUserId) return { error: "You're signed in as this person from the console: their account can't be changed." }
  return { s }
}
const log = (userId, action, summary) => logToMemberships(userId, { type: "security", action, summary, actorUserId: userId })

// ---------- name ----------

export async function updateMyName(input) {
  const { s, error } = await me()
  if (error) return { error }
  const name = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (name.length < 2) return { error: "Enter your name." }
  if (name.length > 100) return { error: "That's too long." }
  if (name === s.user.name) return { ok: true }
  await authDb()("users").where({ id: s.user.id }).update({ name, updatedAt: new Date(), updatedBy: s.user.id })
  await log(s.user.id, "member.name_changed", `changed their name to ${name}`)
  return { ok: true }
}

// ---------- photo ----------

const MAX_PHOTO = 600 * 1024
const TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }
// The file really is that kind of image (not just named so)
const looksLike = (buf, type) =>
  type === "image/png" ? buf[0] === 0x89 && buf[1] === 0x50 : type === "image/jpeg" ? buf[0] === 0xff && buf[1] === 0xd8 : buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP"

// formData: photo (a square image the browser has already cropped and shrunk)
export async function uploadMyPhoto(formData) {
  const { s, error } = await me()
  if (error) return { error }
  const file = formData?.get?.("photo")
  if (!file || typeof file.arrayBuffer !== "function") return { error: "Choose a photo." }
  const ext = TYPES[file.type]
  if (!ext) return { error: "Use a JPG, PNG or WebP photo." }
  if (file.size > MAX_PHOTO) return { error: "That photo is too large." }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (!looksLike(buffer, file.type)) return { error: "That file isn't a photo." }
  const key = await saveFile({ folder: "avatars", buffer, ext, contentType: file.type })
  const db = authDb()
  const before = await db("users").where({ id: s.user.id }).first("avatarUrl")
  await db("users")
    .where({ id: s.user.id })
    .update({ avatarUrl: avatarUrl(key), updatedAt: new Date(), updatedBy: s.user.id })
  // The old uploaded photo (not a Google one) goes
  const old = avatarKey(before?.avatarUrl)
  if (old) await deleteFile(old).catch(() => {})
  await log(s.user.id, "member.photo_changed", "changed their photo")
  return { ok: true }
}

export async function removeMyPhoto() {
  const { s, error } = await me()
  if (error) return { error }
  const db = authDb()
  const before = await db("users").where({ id: s.user.id }).first("avatarUrl")
  if (!before?.avatarUrl) return { ok: true }
  await db("users").where({ id: s.user.id }).update({ avatarUrl: null, updatedAt: new Date(), updatedBy: s.user.id })
  const old = avatarKey(before.avatarUrl)
  if (old) await deleteFile(old).catch(() => {})
  await log(s.user.id, "member.photo_removed", "removed their photo")
  return { ok: true }
}

// ---------- password ----------

const passwordSchema = z
  .object({
    current: z.string().max(128).optional().default(""),
    password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(128, "That's too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })

// Change your password (or set one, when you only sign in with Google). Signs every other browser
// out and emails a notice → { ok } | { fieldErrors } | { error }
export async function changeMyPassword(input) {
  const { s, error } = await me()
  if (error) return { error }
  const parsed = passwordSchema.safeParse(input ?? {})
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const { current, password } = parsed.data
  const db = authDb()
  const user = await db("users").where({ id: s.user.id }).first("id", "name", "email", "passwordHash")
  if (user.passwordHash) {
    if (!current) return { fieldErrors: { current: "Enter your current password." } }
    if (!(await verifyPassword(user.passwordHash, current))) return { fieldErrors: { current: "That isn't your current password." } }
    if (await verifyPassword(user.passwordHash, password)) return { fieldErrors: { password: "That's your current password. Choose a new one." } }
  }
  const now = new Date()
  await db("users")
    .where({ id: user.id })
    .update({ passwordHash: await hashPassword(password), passwordChangedAt: now, mustChangePassword: false, updatedAt: now, updatedBy: user.id })
  // Everywhere else is signed out; this browser stays signed in
  const others = await db("sessions").where({ userId: user.id }).whereNull("revokedAt").whereNot({ id: s.id }).update({ revokedAt: now })
  await log(user.id, user.passwordHash ? "member.password_changed" : "member.password_set", user.passwordHash ? "changed their password" : "set a password")
  const { ip } = await requestInfo()
  after(() => sendEmail("password-changed", { to: user.email, data: { name: user.name, ip, changed_at: now, reset_url: siteUrl("auth", "/forgot-password") } }))
  return { ok: true, signedOut: others }
}

// ---------- signed-in browsers ----------

// Sign one of your other browsers out (key: from the profile page's list)
export async function signOutSession(key) {
  const { s, error } = await me()
  if (error) return { error }
  const id = Number(key)
  if (!id || id === s.id) return { error: "That's this browser. Use Sign out in your menu instead." }
  const done = await authDb()("sessions").where({ id, userId: s.user.id }).whereNull("revokedAt").update({ revokedAt: new Date() })
  if (!done) return { error: "That browser is already signed out." }
  await log(s.user.id, "member.session_ended", "signed out another browser")
  return { ok: true }
}

export async function signOutOtherSessions() {
  const { s, error } = await me()
  if (error) return { error }
  const count = await authDb()("sessions").where({ userId: s.user.id }).whereNull("revokedAt").whereNot({ id: s.id }).where("expiresAt", ">", new Date()).update({ revokedAt: new Date() })
  if (count) await log(s.user.id, "member.sessions_ended", `signed out ${count} other ${count === 1 ? "browser" : "browsers"}`)
  return { ok: true, count }
}
