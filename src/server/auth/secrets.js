import crypto from "node:crypto"
import { hash, verify } from "@node-rs/argon2"

// Passwords: argon2id with the library defaults (19 MiB memory, 2 passes: OWASP minimum)
export const hashPassword = (password) => hash(password)
export async function verifyPassword(stored, password) {
  if (!stored) return false
  try {
    return await verify(stored, password)
  } catch {
    return false
  }
}

// Session and invitation tokens: random, sent to the browser once; only the SHA-256 is stored
export const newToken = () => crypto.randomBytes(32).toString("base64url")
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex")

// 6-digit one-time codes (sign-up, email verification, password reset, screen unlock),
// stored as an HMAC keyed with SESSION_SECRET so they can't be guessed from the table
export const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
export function hashOtp(code) {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set.")
  return crypto.createHmac("sha256", secret).update(String(code)).digest("hex")
}

// Readable one-time password for a new account, e.g. "Rk7m-Qp2x-Hv9d"
export function newPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  const pick = () => chars[crypto.randomInt(chars.length)]
  return Array.from({ length: 3 }, () => Array.from({ length: 4 }, pick).join("")).join("-")
}

// Constant-time comparison of two hex digests
export function sameHash(a, b) {
  const x = Buffer.from(String(a), "hex")
  const y = Buffer.from(String(b), "hex")
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Tamper-proof small values (e.g. the Google sign-in state cookie): "payload.signature",
// signed with SESSION_SECRET. Returns the parsed payload, or null if it was altered.
export function signValue(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")
  return `${payload}.${sig}`
}
export function readSigned(value) {
  const [payload, sig] = String(value ?? "").split(".")
  if (!payload || !sig) return null
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString())
  } catch {
    return null
  }
}
