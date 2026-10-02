"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { DOCUMENT_TYPES, IMAGE_TYPES, attachAssets, findAsset, removeAsset, setCover, storeAsset, updateAsset } from "@/server/assets"
import { can, isFullAccess } from "@/modules/users/permissions"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { estateAction } from "./context"

// A project's photos (one is its cover / featured image) and documents (layout plan, NOC,
// brochure…), stored as assets of the project. One file per call; the browser loops.

const project = (ctx, code) =>
  live(ctx.db, "projects")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "name")

// An asset of a project in this workspace (estate's own)
async function projectAsset(ctx, code) {
  const asset = await findAsset(ctx.db, code)
  return asset && asset.app === "estate" && asset.ownerType === "project" ? asset : null
}

// formData: file, collection ("images" | "documents"), category?, title? → { ok } or { error }
export async function uploadProjectFile(projectCode, formData) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const p = await project(ctx, projectCode)
  if (!p) return { error: "That project was removed." }
  const collection = formData?.get?.("collection") === "images" ? "images" : "documents"
  let category = null
  if (collection === "documents") {
    const list = (await getLookups(ctx.db, ["project-document-type"]))["project-document-type"]
    const wanted = String(formData.get("category") ?? "")
    category = isLookupValue(list, wanted) ? wanted : (list.find((v) => v.preselected && v.isActive)?.value ?? null)
  }
  const result = await storeAsset(ctx.db, ctx.tenant, {
    app: "estate",
    ownerType: "project",
    ownerId: p.id,
    collection,
    category,
    title: String(formData.get("title") ?? "").trim(),
    file: formData.get("file"),
    allowed: collection === "images" ? IMAGE_TYPES : DOCUMENT_TYPES,
    userId: ctx.user.id,
  })
  if (result.error) return { error: collection === "images" && result.error.includes("isn't a file type") ? `${formData.get("file")?.name}: use a JPG, PNG or WebP photo.` : result.error }
  await logActivity(ctx.db, {
    type: "estate",
    action: `project.${collection}_added`,
    actorUserId: ctx.user.id,
    summary: collection === "images" ? `added a photo to ${p.name}` : `added "${result.asset.title}" to ${p.name}`,
    subjectType: "project",
    subjectId: p.id,
  })
  return { ok: true }
}

const detailsSchema = z.object({ title: z.string().trim().min(1, "Give it a title.").max(150), category: z.string().nullable().optional() })

export async function updateProjectFile(code, input) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const asset = await projectAsset(ctx, code)
  if (!asset) return { error: "That file was removed." }
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const patch = { title: parsed.data.title }
  if (asset.collection === "documents" && parsed.data.category && parsed.data.category !== asset.category) {
    const list = (await getLookups(ctx.db, ["project-document-type"]))["project-document-type"]
    if (!isLookupValue(list, parsed.data.category)) return { error: "Pick a document type from the list." }
    patch.category = parsed.data.category
  }
  await updateAsset(ctx.db, asset, patch, ctx.user.id)
  return { ok: true }
}

export async function setProjectCover(code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const asset = await projectAsset(ctx, code)
  if (!asset || asset.collection !== "images") return { error: "That photo was removed." }
  await setCover(ctx.db, asset, ctx.user.id)
  return { ok: true }
}

export async function removeProjectFile(code) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const asset = await projectAsset(ctx, code)
  if (!asset) return { error: "That file was already removed." }
  await removeAsset(ctx.db, asset, ctx.user.id)
  const p = await live(ctx.db, "projects").where({ id: asset.ownerId }).first("name")
  await logActivity(ctx.db, {
    type: "estate",
    action: `project.${asset.collection}_removed`,
    actorUserId: ctx.user.id,
    summary: asset.collection === "images" ? `removed a photo from ${p?.name ?? "a project"}` : `removed "${asset.title}" from ${p?.name ?? "a project"}`,
    subjectType: "project",
    subjectId: asset.ownerId,
  })
  return { ok: true }
}

// Picked from the file manager's Library: attach existing files (same stored file, new entry)
export async function attachProjectFiles(projectCode, codes, { collection, category } = {}) {
  const { ctx, error } = await estateAction("edit")
  if (error) return { error }
  const p = await project(ctx, projectCode)
  if (!p) return { error: "That project was removed." }
  const kind = collection === "images" ? "images" : "documents"
  const wanted = [...new Set((Array.isArray(codes) ? codes : []).map(String))].slice(0, 100)
  const sources = (await live(ctx.db, "assets").whereIn("code", wanted))
    // Only files this person may open, and only images into photos
    .filter((a) => isFullAccess(ctx.permissions) || can(ctx.permissions, a.app, a.isPrivate ? "edit" : "view"))
    .filter((a) => kind !== "images" || IMAGE_TYPES.includes(a.mime))
  if (!sources.length) return { error: "Those files aren't available any more." }
  let cat = null
  if (kind === "documents") {
    const list = (await getLookups(ctx.db, ["project-document-type"]))["project-document-type"]
    cat = isLookupValue(list, category) ? category : null
  }
  const added = await attachAssets(ctx.db, sources, { app: "estate", ownerType: "project", ownerId: p.id, collection: kind, category: cat, userId: ctx.user.id })
  if (added)
    await logActivity(ctx.db, {
      type: "estate",
      action: `project.${kind}_added`,
      actorUserId: ctx.user.id,
      summary: `added ${added} ${kind === "images" ? (added === 1 ? "photo" : "photos") : added === 1 ? "document" : "documents"} to ${p.name} from the library`,
      subjectType: "project",
      subjectId: p.id,
    })
  return { ok: true, added }
}
