import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

// Any S3-compatible bucket. Examples:
//   AWS S3              S3_REGION=ap-south-1                       (no endpoint)
//   DigitalOcean Spaces S3_REGION=sgp1  S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
//   Cloudflare R2       S3_REGION=auto  S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
//   MinIO               S3_ENDPOINT=http://localhost:9000  S3_FORCE_PATH_STYLE=true
// Objects are private (no public ACL); PropFlow serves them through its own routes.
// S3_PREFIX puts every key under a folder of the bucket (e.g. "propflow/").
export function s3Driver() {
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.")
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId, secretAccessKey },
  })
  const prefix = (process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, "")
  const Key = (key) => (prefix ? `${prefix}/${key}` : key)
  return {
    name: "s3",
    async put(key, buffer, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: Key(key), Body: buffer, ContentType: contentType }))
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: Key(key) }))
      return Buffer.from(await res.Body.transformToByteArray())
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: Key(key) }))
    },
  }
}
