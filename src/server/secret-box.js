import "server-only"
import crypto from "node:crypto"

// Secrets stored in a database (e.g. a workspace's SMTP password), encrypted with ENCRYPTION_KEY
// (64 hex characters = 32 bytes) using AES-256-GCM. Stored as "v1.<iv>.<tag>.<data>" (base64url),
// so a tampered value fails to open instead of decrypting to garbage.

function key() {
  const hex = process.env.ENCRYPTION_KEY?.trim()
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("ENCRYPTION_KEY must be 64 hex characters.")
  return Buffer.from(hex, "hex")
}

export function sealSecret(text) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".")
}

// The plain text, or null when the value is missing or can't be opened (wrong key, tampered)
export function openSecret(sealed) {
  const [v, iv, tag, data] = String(sealed ?? "").split(".")
  if (v !== "v1" || !iv || !tag || !data) return null
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
