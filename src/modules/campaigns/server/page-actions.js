"use server"

import crypto from "node:crypto"
import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { IMAGE_TYPES, storeAsset } from "@/server/assets"
import { slugify } from "@/modules/lookups/catalog"
import { BUTTONS, FONTS, RADII, SECTIONS, TEMPLATES, fillPlaceholders, templateSections } from "../landing/library"
import { campaignsAction } from "./context"
import { inventoryRows, projectVars } from "./pages"
import { createFormRow } from "./forms"
import { isShortMapLink } from "../landing/maps"

// A maps.app.goo.gl link → the full Google Maps address it points to (or "" if it can't be read)
async function expandShortLink(url) {
  let next = url
  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(6000) })
      const to = res.headers.get("location")
      if (!to) break
      next = new URL(to, next).toString()
      if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(next)) return next
    }
  } catch {
    // Offline or blocked: the address is searched instead
  }
  return /google\.[a-z.]+\/maps/i.test(next) ? next : ""
}

// Landing pages in the app: add from a template, save the builder, publish / unpublish,
// duplicate, delete, the page's image folder, and fill prices from the project's inventory

// A campaign, project or form by its code → its row (campaigns carry their project) | null
const byCode = (ctx, table, code) =>
  code
    ? live(ctx.db, table)
        .where({ code: String(code).toUpperCase() })
        .first(table === "campaigns" ? ["id", "projectId"] : ["id"])
    : null
const pageByCode = (ctx, code) =>
  live(ctx.db, "landingPages")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()

// A free address for the page: its slug, or slug-2, slug-3…
async function freeSlug(db, wanted, exceptId = 0) {
  const base = slugify(wanted).slice(0, 80) || "page"
  for (let n = 1; n < 200; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    const taken = await live(db, "landingPages").where({ slug }).whereNot({ id: exceptId }).first("id")
    if (!taken) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

// → { ok, code } | { error } | { fieldErrors }
// form: an existing form's code, or "new" (the default) for a starter form made with the page —
// every landing page collects enquiries, so it always has a lead form
export async function createPage({ name, template = "launch", campaign, project, form = "new" } = {}) {
  const { ctx, error } = await campaignsAction("create")
  if (error) return { error }
  const n = String(name ?? "").trim()
  if (n.length < 2) return { fieldErrors: { name: "Give the page a name." } }
  if (!TEMPLATES.some((t) => t.key === template)) return { fieldErrors: { template: "Pick a starting point." } }
  const [c, p, f] = await Promise.all([byCode(ctx, "campaigns", campaign), byCode(ctx, "projects", project), form && form !== "new" ? byCode(ctx, "leadForms", form) : null])
  if (form && form !== "new" && !f) return { fieldErrors: { form: "That form was removed. Pick another, or create a new one." } }
  const projectId = p?.id ?? c?.projectId ?? null
  const vars = await projectVars(ctx.db, projectId, ctx.tenant.name)
  let sections = fillPlaceholders(templateSections(template), vars)
  // Prices from the project's inventory when it has some
  const rows = await inventoryRows(ctx.db, projectId)
  if (rows.length) sections = sections.map((s) => (s.type === "pricing" ? { ...s, rows } : s))
  let code
  await ctx.db.transaction(async (trx) => {
    code = await nextCode(trx, "landing-page")
    await trx("landingPages").insert({
      code,
      name: n.slice(0, 150),
      slug: await freeSlug(trx, n),
      template,
      campaignId: c?.id ?? null,
      projectId,
      formId:
        f?.id ??
        (
          await live(trx, "leadForms")
            .where({ code: await createFormRow(trx, { name: `${n} enquiries`.slice(0, 150), campaignId: c?.id ?? null, projectId, userId: ctx.user.id }) })
            .first("id")
        ).id,
      status: "draft",
      theme: JSON.stringify({ accent: "blue", font: "inter", radius: "lg", buttons: "solid" }),
      seo: JSON.stringify({ title: "", description: "", image: "" }),
      sections: JSON.stringify(sections),
      createdBy: ctx.user.id,
    })
  })
  await logActivity(ctx.db, { type: "campaigns", action: "page.created", actorUserId: ctx.user.id, summary: `added the landing page ${n} (${code})` })
  return { ok: true, code }
}

const sectionSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(Object.keys(SECTIONS)),
    variant: z.string().max(30),
    hidden: z.boolean().optional().default(false),
    style: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough()
const pageSchema = z.object({
  name: z.string().trim().min(2, "Give the page a name.").max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Give the page an address.")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes, e.g. skyline-launch."),
  campaign: z.string().trim().max(20).optional().nullable(),
  project: z.string().trim().max(30).optional().nullable(),
  form: z.string({ message: "Choose the page's lead form." }).trim().min(1, "Choose the page's lead form.").max(20),
  theme: z.object({
    accent: z.string().max(20),
    font: z.enum(FONTS.map((f) => f.value)),
    radius: z.enum(RADII.map((r) => r.value)),
    buttons: z.enum(BUTTONS.map((b) => b.value)),
    logo: z.string().max(300).optional().default(""),
    phone: z.string().trim().max(30).optional().default(""),
    whatsapp: z.string().trim().max(30).optional().default(""),
  }),
  seo: z.object({ title: z.string().trim().max(120).optional().default(""), description: z.string().trim().max(300).optional().default(""), image: z.string().max(300).optional().default("") }),
  sections: z.array(sectionSchema).max(60, "A page can have up to 60 sections."),
})

// Save the builder → { ok, slug } | { error } | { fieldErrors }
export async function savePage(code, input) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const parsed = pageSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return ["name", "slug", "form"].includes(issue.path[0]) ? { fieldErrors: { [issue.path[0]]: issue.message } } : { error: issue.message }
  }
  const v = parsed.data
  // Short Google Maps links (maps.app.goo.gl) can't be shown as a map: expand them once, on save
  for (const sec of v.sections) {
    if (sec.type !== "location") continue
    if (!sec.mapUrl || !isShortMapLink(sec.mapUrl)) {
      delete sec.mapResolved
      continue
    }
    if (sec.mapResolved && sec.mapFrom === sec.mapUrl) continue
    sec.mapResolved = await expandShortLink(sec.mapUrl)
    sec.mapFrom = sec.mapUrl
  }
  const sections = JSON.stringify(v.sections)
  if (sections.length > 400_000) return { error: "This page is too big. Remove a few sections or long texts." }
  const page = await pageByCode(ctx, code)
  if (!page) return { error: "That page was removed." }
  const taken = await live(ctx.db, "landingPages").where({ slug: v.slug }).whereNot({ id: page.id }).first("id")
  if (taken) return { fieldErrors: { slug: "Another page already uses this address." } }
  const [c, p, f] = await Promise.all([byCode(ctx, "campaigns", v.campaign), byCode(ctx, "projects", v.project), byCode(ctx, "leadForms", v.form)])
  if (!f) return { fieldErrors: { form: "That form was removed. Choose another." } }
  await ctx
    .db("landingPages")
    .where({ id: page.id })
    .update({
      name: v.name,
      slug: v.slug,
      campaignId: c?.id ?? null,
      projectId: p?.id ?? null,
      formId: f?.id ?? null,
      theme: JSON.stringify(v.theme),
      seo: JSON.stringify(v.seo),
      sections,
      updatedAt: new Date(),
      updatedBy: ctx.user.id,
    })
  return { ok: true, slug: v.slug }
}

// Publish or take offline → { ok } | { error }
export async function setPagePublished(code, on) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const page = await pageByCode(ctx, code)
  if (!page) return { error: "That page was removed." }
  if (on) {
    const form = page.formId ? await live(ctx.db, "leadForms").where({ id: page.formId }).first("status") : null
    if (!form) return { error: "Choose the page's lead form (Settings) before publishing." }
    if (form.status !== "active") return { error: "The page's lead form is paused. Accept entries on it (Lead forms) before publishing." }
    const sections = (typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections) ?? []
    if (!sections.some((x) => !x.hidden && (x.type === "form" || (x.type === "hero" && x.variant === "form")))) return { error: "Add an Enquiry form section (or a hero with the form) before publishing." }
  }
  await ctx
    .db("landingPages")
    .where({ id: page.id })
    .update({ status: on ? "published" : "draft", ...(on && !page.publishedAt ? { publishedAt: new Date() } : {}), updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "campaigns", action: on ? "page.published" : "page.unpublished", actorUserId: ctx.user.id, summary: `${on ? "published" : "took offline"} the landing page ${page.name}` })
  return { ok: true }
}

// A copy as a draft → { ok, code } | { error }
export async function duplicatePage(code) {
  const { ctx, error } = await campaignsAction("create")
  if (error) return { error }
  const page = await pageByCode(ctx, code)
  if (!page) return { error: "That page was removed." }
  let copy
  await ctx.db.transaction(async (trx) => {
    copy = await nextCode(trx, "landing-page")
    const { id: _id, code: _code, slug, views: _v, publishedAt: _p, createdAt: _c, updatedAt: _u, updatedBy: _ub, ...rest } = page
    await trx("landingPages").insert({ ...rest, code: copy, name: `${page.name} (copy)`.slice(0, 150), slug: await freeSlug(trx, `${slug}-copy`), status: "draft", views: 0, createdBy: ctx.user.id })
  })
  return { ok: true, code: copy }
}

// Delete (soft) → { ok } | { error }
export async function deletePage(code) {
  const { ctx, error } = await campaignsAction("delete")
  if (error) return { error }
  const page = await pageByCode(ctx, code)
  if (!page) return { ok: true }
  await ctx.db("landingPages").where({ id: page.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "campaigns", action: "page.deleted", actorUserId: ctx.user.id, summary: `deleted the landing page ${page.name}` })
  return { ok: true }
}

// Each page has its own image folder (asset_folders, owner landing-page), made when first needed.
// Its images are only offered in that page's builder; they're public files, since visitors
// see them (/api/public/files/<workspace>/<code>).
async function pageFolder(db, page, userId) {
  const found = await live(db, "assetFolders").where({ ownerType: "landing-page", ownerId: page.id }).first("id")
  if (found) return found.id
  const [id] = await db("assetFolders").insert({
    code: crypto.randomBytes(9).toString("base64url").toLowerCase(),
    name: `${page.code} · ${page.name}`.slice(0, 120),
    app: "campaigns",
    ownerType: "landing-page",
    ownerId: page.id,
    createdBy: userId,
  })
  return id
}
const imageUrl = (ctx, code) => `/api/public/files/${ctx.tenant.slug}/${code}`

// The page's images, newest first → { ok, files: [{ code, url, name, mime, size, at }] } | { error }
export async function listPageImages(code) {
  const { ctx, error } = await campaignsAction("view")
  if (error) return { error }
  const page = await pageByCode(ctx, code)
  if (!page) return { error: "That page was removed." }
  const rows = await live(ctx.db, "assets").where({ app: "campaigns", ownerType: "landing-page", ownerId: page.id }).orderBy("id", "desc").select("code", "fileName", "mime", "size", "createdAt")
  return { ok: true, files: rows.map((r) => ({ code: r.code, url: imageUrl(ctx, r.code), name: r.fileName, mime: r.mime, size: Number(r.size), at: r.createdAt })) }
}

// Upload images into the page's folder (FormData "files") → { ok, codes, urls } | { error }
export async function uploadPageImages(code, form) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const page = await pageByCode(ctx, code)
  if (!page) return { error: "That page was removed." }
  const files = (form?.getAll?.("files") ?? []).filter((f) => f && typeof f === "object" && f.size)
  if (!files.length) return { error: "Choose an image." }
  if (files.length > 10) return { error: "Up to 10 images at a time." }
  const folderId = await pageFolder(ctx.db, page, ctx.user.id)
  const codes = []
  for (const file of files) {
    const r = await storeAsset(ctx.db, ctx.tenant, {
      app: "campaigns",
      ownerType: "landing-page",
      ownerId: page.id,
      folderId,
      collection: "images",
      title: file.name,
      file,
      allowed: IMAGE_TYPES,
      isPrivate: false,
      userId: ctx.user.id,
    })
    if (r?.error) return { error: r.error }
    codes.push(r.asset.code)
  }
  return { ok: true, codes, urls: codes.map((c) => imageUrl(ctx, c)) }
}

// Prices from the chosen project's available units → { ok, rows } | { error }
export async function pricesFromInventory(projectCode) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const p = await byCode(ctx, "projects", projectCode)
  if (!p) return { error: "Pick the page's project first." }
  const rows = await inventoryRows(ctx.db, p.id)
  return rows.length ? { ok: true, rows } : { error: "That project has no available units yet." }
}
