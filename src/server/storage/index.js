import "server-only"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

// Uploaded files (payment proofs now; documents later). STORAGE_DRIVER=local keeps them on this
// server under STORAGE_LOCAL_PATH, outside public/, so they're only reachable through routes that
// check access. An S3-compatible driver can slot in behind the same three functions.

const driver = () => process.env.STORAGE_DRIVER || "local"
const root = () => path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH || "./storage")
// Keys we create: folder/yyyy/mm/<random>.<ext>
const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/\d{4}\/\d{2}\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/

function localPath(key) {
  if (!KEY.test(key)) throw new Error("Bad storage key.")
  return path.join(root(), key)
}

function assertDriver() {
  if (driver() !== "local") throw new Error(`Storage driver "${driver()}" isn't set up yet; use STORAGE_DRIVER=local.`)
}

// Save bytes under a folder ("payment-proofs"); returns the key to store in the database
export async function saveFile({ folder, buffer, ext }) {
  assertDriver()
  const now = new Date()
  const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomBytes(16).toString("hex")}.${ext}`
  const file = localPath(key)
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o750 })
  await fs.writeFile(file, buffer, { mode: 0o640, flag: "wx" })
  return key
}

export async function readFile(key) {
  assertDriver()
  return fs.readFile(localPath(key))
}

export async function deleteFile(key) {
  assertDriver()
  await fs.rm(localPath(key), { force: true })
}
