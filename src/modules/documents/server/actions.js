"use server"

import crypto from "node:crypto"
import { z } from "zod"
import { live } from "@/server/db/records"
import { storeAsset } from "@/server/assets"
import { DOCUMENT_FILE_TYPES, DOCUMENT_MAX_BYTES } from "@/server/storage/file-types"
import { logActivity } from "@/server/tenants/activity"
import { documentsAction } from "./context"
import { canShareType, findDocument, shareUrl, versionChain } from "./queries"

// Documents: upload, edit, versions, delete and share links. Uploading needs documents.create;
// editing, new versions and restoring need edit; deleting needs delete; share links need the
// documents.share grant, the "sharing" feature and a type that may leave the workspace (never
// buyer, HR or finance files). Every change checks the type's "Who can see" too.
//
// Share links point at the version current when the link was made, and always open the latest
// version of that document: a renewed NOC uploaded as a new version reaches whoever has the link.

const MAX_FILES = 20
const fieldErrors = (parsed) => ({ fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) })
const day = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a date.")
  .optional()
  .default("")
const text = (max) => z.string().trim().max(max).optional().default("")

const detailsSchema = z.object({
  title: z.string().trim().min(1, "Give it a name.").max(150),
  type: z.string().trim().min(1, "Pick a type."),
  project: text(20),
  expiresOn: day,
  note: text(500),
})

const projectId = async (ctx, code) =>
  code
    ? ((await live(ctx.db, "projects")
        .where({ code: String(code).toUpperCase() })
        .first("id")) ?? false)
    : null

const visibleType = (ctx, type) => ctx.types.some((t) => t.value === type) && ctx.canSeeType(type)
const typeLabel = (ctx, type) => ctx.types.find((t) => t.value === type)?.label ?? type
const files = (form) => (form?.getAll?.("files") ?? []).filter((f) => f && typeof f === "object" && f.size)

// Upload one or more files as company documents → { ok, codes } | { error } | { fieldErrors }
//   form: files[], type, project (code), expiresOn (YYYY-MM-DD), note, title (one file only)
export async function uploadDocuments(form) {
  const { ctx, error } = await documentsAction("create")
  if (error) return { error }
  const list = files(form)
  if (!list.length) return { error: "Choose a file." }
  if (list.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files at a time.` }
  const type = String(form.get("type") ?? "")
  if (!visibleType(ctx, type)) return { fieldErrors: { type: "Pick a type." } }
  const project = await projectId(ctx, form.get("project"))
  if (project === false) return { fieldErrors: { project: "That project was removed." } }
  const expiresOn = ctx.has("expiry") ? day.safeParse(String(form.get("expiresOn") ?? "")).data || null : null
  const note = String(form.get("note") ?? "")
    .trim()
    .slice(0, 500)
  const title = list.length === 1 ? String(form.get("title") ?? "").trim() : ""
  const codes = []
  for (const file of list) {
    const r = await storeAsset(ctx.db, ctx.tenant, {
      app: "documents",
      collection: "documents",
      category: type,
      title: title || undefined,
      file,
      allowed: DOCUMENT_FILE_TYPES,
      maxBytes: DOCUMENT_MAX_BYTES,
      userId: ctx.user.id,
      extra: { expiresOn, note: note || null, projectId: project, version: 1 },
    })
    if (r.error) return codes.length ? { error: `${r.error} ${codes.length} uploaded before it.`, codes } : { error: r.error }
    codes.push(r.asset.code)
  }
  await logActivity(ctx.db, {
    type: "documents",
    action: "document.uploaded",
    actorUserId: ctx.user.id,
    summary: list.length === 1 ? `uploaded ${title || list[0].name} to ${typeLabel(ctx, type)}` : `uploaded ${list.length} documents to ${typeLabel(ctx, type)}`,
  })
  return { ok: true, codes }
}

// Rename, move to another type or project, set the expiry date or note → { ok } | { error } | { fieldErrors }
// Name, type and project apply to every version; expiry and note to the current one.
export async function updateDocument(code, input) {
  const { ctx, error } = await documentsAction("edit")
  if (error) return { error }
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const v = parsed.data
  const asset = await findDocument(ctx, code)
  if (!asset) return { error: "That document was removed or isn't yours to see." }
  if (!visibleType(ctx, v.type)) return { fieldErrors: { type: "Pick a type." } }
  const project = await projectId(ctx, v.project)
  if (project === false) return { fieldErrors: { project: "That project was removed." } }
  const chain = await versionChain(ctx.db, asset)
  const current = chain.find((a) => !a.supersededAt) ?? chain[0]
  const now = new Date()
  const expiresOn = ctx.has("expiry") ? v.expiresOn || null : current.expiresOn
  const sameExpiry = (current.expiresOn ? new Date(current.expiresOn).toISOString().slice(0, 10) : null) === (expiresOn ? String(expiresOn).slice(0, 10) : null)
  await ctx.db.transaction(async (trx) => {
    await trx("assets")
      .whereIn(
        "id",
        chain.map((a) => a.id),
      )
      .update({ title: v.title, category: v.type, projectId: project, updatedAt: now, updatedBy: ctx.user.id })
    await trx("assets")
      .where({ id: current.id })
      .update({ expiresOn, note: v.note || null, ...(sameExpiry ? {} : { remindedAt: null }) })
  })
  await logActivity(ctx.db, { type: "documents", action: "document.updated", actorUserId: ctx.user.id, summary: `updated ${v.title} in Documents` })
  return { ok: true }
}

// A newer file for a document: it becomes the current version, earlier ones stay (superseded)
//   form: file, expiresOn (optional new date, e.g. a renewed NOC), note → { ok, code } | { error }
export async function uploadNewVersion(code, form) {
  const { ctx, error } = await documentsAction("edit")
  if (error) return { error }
  const asset = await findDocument(ctx, code)
  if (!asset) return { error: "That document was removed or isn't yours to see." }
  const [file] = files(form)
  if (!file) return { error: "Choose a file." }
  const chain = await versionChain(ctx.db, asset)
  const current = chain.find((a) => !a.supersededAt) ?? chain[0]
  const expiresOn = ctx.has("expiry") && form.has("expiresOn") ? day.safeParse(String(form.get("expiresOn") ?? "")).data || null : current.expiresOn
  const note = form.has("note")
    ? String(form.get("note") ?? "")
        .trim()
        .slice(0, 500) || null
    : current.note
  const r = await storeAsset(ctx.db, ctx.tenant, {
    app: "documents",
    collection: "documents",
    category: current.category,
    title: current.title,
    file,
    allowed: DOCUMENT_FILE_TYPES,
    maxBytes: DOCUMENT_MAX_BYTES,
    userId: ctx.user.id,
    extra: { expiresOn, note, projectId: current.projectId, version: current.version + 1, replacesId: current.id },
  })
  if (r.error) return { error: r.error }
  await ctx.db("assets").where({ id: current.id }).update({ supersededAt: new Date(), updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "documents", action: "document.version", actorUserId: ctx.user.id, summary: `uploaded version ${current.version + 1} of ${current.title}` })
  return { ok: true, code: r.asset.code }
}

// Make an earlier version current again: it's copied as a new version (same stored file), so the
// history stays in order → { ok, code } | { error }
export async function restoreVersion(code) {
  const { ctx, error } = await documentsAction("edit")
  if (error) return { error }
  const old = await findDocument(ctx, code)
  if (!old) return { error: "That version was removed or isn't yours to see." }
  if (!old.supersededAt) return { error: "That's already the current version." }
  const chain = await versionChain(ctx.db, old)
  const current = chain.find((a) => !a.supersededAt) ?? chain[0]
  const newCode = crypto.randomBytes(16).toString("hex").slice(0, 20)
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    await trx("assets").insert({
      code: newCode,
      app: "documents",
      collection: "documents",
      category: current.category,
      title: current.title,
      fileKey: old.fileKey,
      fileName: old.fileName,
      mime: old.mime,
      size: old.size,
      expiresOn: current.expiresOn,
      remindedAt: current.remindedAt,
      note: current.note,
      projectId: current.projectId,
      version: current.version + 1,
      replacesId: current.id,
      sortOrder: current.sortOrder,
      createdBy: ctx.user.id,
    })
    await trx("assets").where({ id: current.id }).update({ supersededAt: now, updatedAt: now, updatedBy: ctx.user.id })
  })
  await logActivity(ctx.db, { type: "documents", action: "document.restored", actorUserId: ctx.user.id, summary: `restored version ${old.version} of ${current.title}` })
  return { ok: true, code: newCode }
}

// Delete a document with all its versions (recycle bin); its share links stop working
export async function deleteDocument(code) {
  const { ctx, error } = await documentsAction("delete")
  if (error) return { error }
  const asset = await findDocument(ctx, code)
  if (!asset) return { error: "That document was already removed." }
  const chain = await versionChain(ctx.db, asset)
  const ids = chain.map((a) => a.id)
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    await trx("assets").whereIn("id", ids).update({ deletedAt: now, deletedBy: ctx.user.id })
    await trx("shareLinks").whereIn("assetId", ids).whereNull("revokedAt").update({ revokedAt: now, revokedBy: ctx.user.id })
  })
  await logActivity(ctx.db, { type: "documents", action: "document.deleted", actorUserId: ctx.user.id, summary: `deleted ${asset.title} from Documents` })
  return { ok: true }
}

const shareSchema = z.object({
  days: z.coerce.number().int().min(1, "1 to 30 days.").max(30, "1 to 30 days."),
  note: text(200),
})

// A link anyone can open without signing in, until it expires (1–30 days) or is revoked
//   → { ok, url, expiresAt } | { error } | { fieldErrors }
export async function createShareLink(code, input) {
  const { ctx, error } = await documentsAction("view", "documents.share")
  if (error) return { error }
  if (!ctx.has("sharing")) return { error: "Share links aren't part of your plan." }
  const parsed = shareSchema.safeParse(input)
  if (!parsed.success) return fieldErrors(parsed)
  const asset = await findDocument(ctx, code)
  if (!asset) return { error: "That document was removed or isn't yours to see." }
  if (!canShareType(ctx, asset.category)) return { error: `${typeLabel(ctx, asset.category)} can't be shared outside the workspace.` }
  const chain = await versionChain(ctx.db, asset)
  const current = chain.find((a) => !a.supersededAt) ?? chain[0]
  const token = crypto.randomBytes(24).toString("base64url")
  const expiresAt = new Date(Date.now() + parsed.data.days * 86_400_000)
  await ctx.db("shareLinks").insert({ token, assetId: current.id, note: parsed.data.note || null, expiresAt, createdBy: ctx.user.id })
  await logActivity(ctx.db, {
    type: "documents",
    action: "document.shared",
    actorUserId: ctx.user.id,
    summary: `shared ${current.title} for ${parsed.data.days} ${parsed.data.days === 1 ? "day" : "days"}${parsed.data.note ? ` (${parsed.data.note})` : ""}`,
  })
  return { ok: true, url: shareUrl(ctx.tenant, token), expiresAt }
}

// Stop a link working before it expires → { ok } | { error }
export async function revokeShareLink(token) {
  const { ctx, error } = await documentsAction("view", "documents.share")
  if (error) return { error }
  const link = await live(ctx.db, "shareLinks")
    .where({ token: String(token ?? "") })
    .first("id", "assetId", "revokedAt")
  if (!link) return { error: "That link was removed." }
  const asset = await ctx.db("assets").where({ id: link.assetId }).first("category", "title")
  if (!asset || !ctx.canSeeType(asset.category)) return { error: "That link was removed." }
  if (link.revokedAt) return { ok: true }
  await ctx.db("shareLinks").where({ id: link.id }).update({ revokedAt: new Date(), revokedBy: ctx.user.id, updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "documents", action: "document.unshared", actorUserId: ctx.user.id, summary: `revoked a share link to ${asset.title}` })
  return { ok: true }
}
