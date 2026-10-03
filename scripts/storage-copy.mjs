// Copy every uploaded file from this server's disk to the S3-compatible bucket, keeping the same
// keys (so the database needs no change). Run before switching STORAGE_DRIVER to s3:
//
//   yarn storage:copy            copy files the bucket doesn't have yet
//   yarn storage:copy --dry-run  only list what would be copied
//
// Reads STORAGE_LOCAL_PATH and the S3_* settings from the env files (.env.local, or
// .env.production with NODE_ENV=production). Safe to run again; existing objects are skipped.
import fs from "node:fs/promises"
import path from "node:path"
import nextEnv from "@next/env"
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const dry = process.argv.includes("--dry-run")
const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH || "./storage")
const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = process.env
if (!bucket || !accessKeyId || !secretAccessKey) {
  console.error("Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (and S3_REGION / S3_ENDPOINT for your provider) first.")
  process.exit(1)
}
const client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId, secretAccessKey },
})
const prefix = (process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, "")
const TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

let copied = 0
let skipped = 0
let failed = 0
try {
  await fs.access(root)
} catch {
  console.log(`Nothing to copy: ${root} doesn't exist.`)
  process.exit(0)
}
for await (const file of walk(root)) {
  const key = path.relative(root, file).split(path.sep).join("/")
  const Key = prefix ? `${prefix}/${key}` : key
  try {
    const exists = await client
      .send(new HeadObjectCommand({ Bucket: bucket, Key }))
      .then(() => true)
      .catch((err) => (err?.$metadata?.httpStatusCode === 404 ? false : Promise.reject(err)))
    if (exists) {
      skipped++
      continue
    }
    if (dry) console.log("would copy", key)
    else await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: await fs.readFile(file), ContentType: TYPES[key.split(".").pop()] ?? "application/octet-stream" }))
    copied++
  } catch (err) {
    failed++
    console.error("failed", key, err.message)
  }
}
console.log(`${dry ? "Would copy" : "Copied"} ${copied}, already there ${skipped}, failed ${failed}.`)
if (!dry && !failed) console.log("Now set STORAGE_DRIVER=s3 and restart. Keep the local folder until you've checked files open.")
process.exit(failed ? 1 : 0)
