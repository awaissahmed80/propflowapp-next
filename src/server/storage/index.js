import "server-only"
import crypto from "node:crypto"
import { localDriver } from "./local"
import { s3Driver } from "./s3"

// Uploaded files (proofs, documents, photos, page images…). Everything goes through saveFile /
// readFile / deleteFile with a key the database keeps, so where the bytes live is a setting:
//   STORAGE_DRIVER=local   on this server under STORAGE_LOCAL_PATH (outside public/)
//   STORAGE_DRIVER=s3      any S3-compatible bucket: AWS S3, DigitalOcean Spaces, Cloudflare R2,
//                          Wasabi, MinIO (S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID,
//                          S3_SECRET_ACCESS_KEY, optional S3_FORCE_PATH_STYLE, S3_PREFIX)
// Buckets stay private: files are only reachable through routes that check access. Moving from
// local to a bucket: `yarn storage:copy` (same keys, so nothing in the database changes).

// Keys we create: folder/yyyy/mm/<random>.<ext>
export const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/\d{4}\/\d{2}\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/
export const storageDriverName = () => process.env.STORAGE_DRIVER || "local"

let current = null
function driver() {
  const name = storageDriverName()
  if (current?.name === name) return current
  if (name === "local") current = localDriver()
  else if (name === "s3") current = s3Driver()
  else throw new Error(`Unknown STORAGE_DRIVER "${name}". Use local or s3.`)
  return current
}

function checkKey(key) {
  if (!KEY.test(key)) throw new Error("Bad storage key.")
  return key
}

// Save bytes under a folder ("payment-proofs"); returns the key to store in the database
//   contentType: the file's type (buckets keep it with the object)
export async function saveFile({ folder, buffer, ext, contentType = "application/octet-stream" }) {
  const now = new Date()
  const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomBytes(16).toString("hex")}.${ext}`
  await driver().put(checkKey(key), buffer, contentType)
  return key
}

// The file's bytes (a Buffer)
export async function readFile(key) {
  return driver().get(checkKey(key))
}

export async function deleteFile(key) {
  await driver().remove(checkKey(key))
}
