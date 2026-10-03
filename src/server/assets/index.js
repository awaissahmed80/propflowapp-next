import "server-only"
import crypto from "node:crypto"
import { live } from "@/server/db/records"
import { saveFile } from "@/server/storage"
import { detectFileType } from "@/server/storage/file-types"

// Every workspace file goes through here into the `assets` table, attached to its record
// (owner_type + owner_id) and app. Apps check their own permissions first, then call these.
// Files are served by /api/workspace/files/[code].

export const MAX_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const DOCUMENT_TYPES = ["application/pdf", ...IMAGE_TYPES]

const newCode = () => crypto.randomBytes(16).toString("hex").slice(0, 20)

// The URL a file is served from (lowercase random code, never the row id)
export const assetUrl = (code, { download = false } = {}) => `/api/workspace/files/${code}${download ? "?download=1" : ""}`

// Shape sent to pages
const view = (a) => ({
  code: a.code,
  app: a.app,
  collection: a.collection,
  category: a.category,
  title: a.title,
  fileName: a.fileName,
  mime: a.mime,
  size: a.size,
  isCover: a.isCover,
  isPrivate: a.isPrivate,
  createdAt: a.createdAt,
  createdBy: a.createdBy,
  url: assetUrl(a.code),
})

// file: a File from FormData. allowed: mime types. Returns { asset } or { error }.
// The first image in an owner's "images" collection becomes its cover.
export async function storeAsset(db, tenant, { app, ownerType = null, ownerId = null, folderId = null, collection, category = null, title, file, allowed, isPrivate = false, userId }) {
  if (!(file instanceof File) || !file.size) return { error: "Choose a file." }
  if (file.size > MAX_BYTES) return { error: `${file.name} is over 10 MB. Use a smaller file.` }
  const buffer = Buffer.from(await file.arrayBuffer())
  const type = detectFileType(buffer)
  if (!type || !allowed.includes(type.mime)) return { error: `${file.name} isn't a file type that can be added here.` }

  const folder = `tenants/${tenant.code.toLowerCase()}/${app}${ownerType ? `/${ownerType}-${ownerId}` : ""}`
  const key = await saveFile({ folder, buffer, ext: type.ext, contentType: type.mime })
  const same = () => live(db, "assets").where({ ownerType, ownerId, collection })
  const hasCover = collection === "images" && ownerType ? await same().clone().where({ isCover: true }).first("id") : true
  const last = await same().clone().max({ n: "sortOrder" }).first()
  const row = {
    code: newCode(),
    app,
    ownerType,
    ownerId,
    folderId,
    collection,
    category,
    title: (title || file.name.replace(/\.[^.]+$/, "")).slice(0, 150),
    fileKey: key,
    fileName: String(file.name).slice(0, 255),
    mime: type.mime,
    size: buffer.length,
    isCover: !hasCover,
    isPrivate,
    sortOrder: (last?.n ?? 0) + 10,
    createdBy: userId,
  }
  await db("assets").insert(row)
  return { asset: view({ ...row, createdAt: new Date() }) }
}

export async function listAssets(db, { ownerType, ownerId, collection, includePrivate = true }) {
  let q = live(db, "assets").where({ ownerType, ownerId }).orderBy("sortOrder").orderBy("id")
  if (collection) q = q.where({ collection })
  if (!includePrivate) q = q.where({ isPrivate: false })
  return (await q).map(view)
}

// Covers (featured images) for many owners at once: ownerId → url
export async function coversFor(db, ownerType, ownerIds) {
  if (!ownerIds.length) return new Map()
  const rows = await live(db, "assets").where({ ownerType, collection: "images", isCover: true }).whereIn("ownerId", ownerIds).select("ownerId", "code")
  return new Map(rows.map((r) => [r.ownerId, assetUrl(r.code)]))
}

export const findAsset = (db, code) =>
  live(db, "assets")
    .where({ code: String(code ?? "").toLowerCase() })
    .first()

export async function updateAsset(db, asset, patch, userId) {
  await db("assets")
    .where({ id: asset.id })
    .update({ ...patch, updatedAt: new Date(), updatedBy: userId })
}

// Make this image its owner's cover
export async function setCover(db, asset, userId) {
  await db.transaction(async (trx) => {
    await trx("assets").where({ ownerType: asset.ownerType, ownerId: asset.ownerId, collection: asset.collection }).update({ isCover: false })
    await trx("assets").where({ id: asset.id }).update({ isCover: true, updatedAt: new Date(), updatedBy: userId })
  })
}

// Soft delete (recycle bin); a removed cover passes to the next image
export async function removeAsset(db, asset, userId) {
  await db("assets").where({ id: asset.id }).update({ deletedAt: new Date(), deletedBy: userId, isCover: false })
  if (asset.isCover) {
    const next = await live(db, "assets").where({ ownerType: asset.ownerType, ownerId: asset.ownerId, collection: asset.collection }).orderBy("sortOrder").first("id")
    if (next) await db("assets").where({ id: next.id }).update({ isCover: true })
  }
}

// Attach existing files to another record: a new asset pointing at the same stored file, so
// removing it from one record never affects the other. Returns how many were attached.
export async function attachAssets(db, sources, { app, ownerType, ownerId, collection, category = null, userId }) {
  if (!sources.length) return 0
  const existing = await live(db, "assets").where({ ownerType, ownerId, collection }).select("fileKey", "isCover")
  const have = new Set(existing.map((a) => a.fileKey))
  let hasCover = collection !== "images" || existing.some((a) => a.isCover)
  const last = await live(db, "assets").where({ ownerType, ownerId, collection }).max({ n: "sortOrder" }).first()
  let order = last?.n ?? 0
  const rows = []
  for (const src of sources) {
    if (have.has(src.fileKey)) continue
    have.add(src.fileKey)
    order += 10
    rows.push({
      code: newCode(),
      app,
      ownerType,
      ownerId,
      collection,
      category: category ?? src.category ?? null,
      title: src.title,
      fileKey: src.fileKey,
      fileName: src.fileName,
      mime: src.mime,
      size: src.size,
      isCover: !hasCover,
      isPrivate: false,
      sortOrder: order,
      createdBy: userId,
    })
    hasCover = true
  }
  if (rows.length) await db("assets").insert(rows)
  return rows.length
}
