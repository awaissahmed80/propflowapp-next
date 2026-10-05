import "server-only"
import { live } from "@/server/db/records"
import { assetUrl } from "@/server/assets"
import { siteUrl } from "@/lib/sites"
import { isFullAccess } from "@/modules/users/permissions"
import { peopleByIds } from "@/modules/users/server/queries"
import { getLookups } from "@/modules/lookups/server"
import { salesContext, scoped } from "@/modules/operations/server/context"
import { APP_SOURCES } from "../nav"
import { SHAREABLE } from "./access"
import { SOON_DAYS, WATCH_DAYS, addDays, daysLeft, expiryState, todayKey } from "../expiry"

// Reads for the Documents app. A company document is an asset with app "documents" whose
// category is its document type; only current versions (superseded_at null) are listed, and only
// types the person may see (Customize › Document types › Who can see).
//   ctx: documentsContext()

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const ruleOf = (ctx, type) => ctx.types.find((t) => t.value === type)?.meta?.access ?? "staff"

// The public address of a share link (the workspace's public site, no sign-in)
export const shareUrl = (tenant, token) => siteUrl("campaigns", `/d/${tenant.slug}/${token}`)

// May this person make share links for a document of this type?
export const canShareType = (ctx, type) => ctx.has("sharing") && Boolean(ctx.grant("documents.share")) && SHAREABLE(ruleOf(ctx, type))

async function hydrate(ctx, rows) {
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))]
  const [projects, people] = await Promise.all([projectIds.length ? ctx.db("projects").whereIn("id", projectIds).select("id", "code", "name") : [], peopleByIds(rows.map((r) => r.createdBy))])
  const projectMap = new Map(projects.map((p) => [p.id, { code: p.code, name: p.name }]))
  const today = todayKey()
  return rows.map((a) => {
    const expiresOn = iso(a.expiresOn)
    const days = daysLeft(expiresOn, today)
    const by = people.get(a.createdBy)
    return {
      code: a.code,
      title: a.title,
      fileName: a.fileName,
      mime: a.mime,
      size: a.size,
      type: a.category,
      note: a.note ?? "",
      project: projectMap.get(a.projectId) ?? null,
      expiresOn,
      daysLeft: days,
      expiry: expiryState(days),
      version: a.version,
      addedAt: a.createdAt,
      uploader: by ? { id: by.id, name: by.name } : null,
      url: assetUrl(a.code),
      canShare: canShareType(ctx, a.category),
    }
  })
}

// Current versions of company documents this person may see, newest first
//   filters: { type, search, project (code), expiry (expired|soon|later|valid|none), uploadedBy, sort (newest|name|expiry) }
export async function listDocuments(ctx, { type = null, search = "", project = null, expiry = null, uploadedBy = null, sort = "newest", limit = 2000 } = {}) {
  if (!ctx.visibleTypes.length || (type && !ctx.canSeeType(type))) return []
  const today = todayKey()
  let q = live(ctx.db, "assets")
    .where({ app: "documents" })
    .whereNull("supersededAt")
    .whereIn("category", type ? [type] : ctx.visibleTypes)
  const term = String(search ?? "").trim()
  if (term)
    q = q.where((w) =>
      w
        .whereLike("title", `%${term}%`)
        .orWhereLike("note", `%${term}%`)
        .orWhereLike("fileName", `%${term}%`)
        .orWhereIn("projectId", ctx.db("projects").whereLike("name", `%${term}%`).select("id")),
    )
  if (project)
    q = q.whereIn(
      "projectId",
      ctx
        .db("projects")
        .where({ code: String(project).toUpperCase() })
        .select("id"),
    )
  if (uploadedBy) q = q.where({ createdBy: uploadedBy })
  if (expiry === "none") q = q.whereNull("expiresOn")
  else if (expiry === "expired") q = q.where("expiresOn", "<", today)
  else if (expiry === "soon") q = q.whereBetween("expiresOn", [today, addDays(today, SOON_DAYS)])
  else if (expiry === "later") q = q.where("expiresOn", ">", addDays(today, SOON_DAYS)).where("expiresOn", "<=", addDays(today, WATCH_DAYS))
  else if (expiry === "valid") q = q.where("expiresOn", ">", addDays(today, WATCH_DAYS))
  if (sort === "name") q = q.orderBy("title")
  else if (sort === "expiry") q = q.whereNotNull("expiresOn").orderBy("expiresOn")
  else q = q.orderBy("createdAt", "desc").orderBy("id", "desc")
  return hydrate(ctx, await q.limit(limit))
}

// Expired, and expiring within 30 and 90 days (current versions, types this person may see)
export async function expiringDocuments(ctx) {
  const today = todayKey()
  if (!ctx.visibleTypes.length) return { expired: [], soon: [], later: [] }
  const rows = await live(ctx.db, "assets")
    .where({ app: "documents" })
    .whereNull("supersededAt")
    .whereIn("category", ctx.visibleTypes)
    .whereNotNull("expiresOn")
    .where("expiresOn", "<=", addDays(today, WATCH_DAYS))
    .orderBy("expiresOn")
  const docs = await hydrate(ctx, rows)
  return { expired: docs.filter((d) => d.expiry === "expired"), soon: docs.filter((d) => d.expiry === "soon"), later: docs.filter((d) => d.expiry === "later") }
}

// Every version of a document, newest first. Versions are a chain: each new upload (or restore)
// replaces the current one (replaces_id) and the old one is marked superseded.
export async function versionChain(db, asset) {
  const rows = [asset]
  let at = asset
  while (at.replacesId) {
    const prev = await live(db, "assets").where({ id: at.replacesId }).first()
    if (!prev) break
    rows.push(prev)
    at = prev
  }
  at = asset
  for (let i = 0; i < 500; i++) {
    const next = await live(db, "assets").where({ replacesId: at.id }).first()
    if (!next) break
    rows.unshift(next)
    at = next
  }
  return rows
}

// A company document by any version's code, if this person may see its type → the asset row
export async function findDocument(ctx, code) {
  const a = await live(ctx.db, "assets")
    .where({ code: String(code ?? "").toLowerCase(), app: "documents" })
    .first()
  return a && ctx.canSeeType(a.category) ? a : null
}

const linkState = (l, now = new Date()) => (l.revokedAt ? "revoked" : new Date(l.expiresAt) <= now ? "expired" : "active")

// One document with its versions and share links → { doc, versions, links, current } or null.
// current: the code of the current version (a superseded version's code still finds its document)
export async function getDocument(ctx, code) {
  const asset = await findDocument(ctx, code)
  if (!asset) return null
  const chain = await versionChain(ctx.db, asset)
  const current = chain.find((a) => !a.supersededAt) ?? chain[0]
  const [shaped, links] = await Promise.all([
    hydrate(ctx, chain),
    shareLinksFor(
      ctx,
      chain.map((a) => a.id),
    ),
  ])
  const versions = shaped.map((v, i) => ({ ...v, current: chain[i].id === current.id, supersededAt: chain[i].supersededAt }))
  return { doc: versions.find((v) => v.current), versions, links, current: current.code }
}

// Share links on these assets (a document's versions), newest first, with their recent opens
async function shareLinksFor(ctx, assetIds, { withAsset = false } = {}) {
  let q = live(ctx.db, "shareLinks").orderBy("createdAt", "desc")
  if (assetIds) q = q.whereIn("assetId", assetIds)
  const rows = await q.limit(500)
  if (!rows.length) return []
  const [views, people] = await Promise.all([
    ctx
      .db("shareLinkViews")
      .whereIn(
        "linkId",
        rows.map((r) => r.id),
      )
      .orderBy("at", "desc")
      .limit(2000)
      .select("linkId", "at", "userAgent"),
    peopleByIds(rows.map((r) => r.createdBy)),
  ])
  const canSeeTokens = ctx.has("sharing") && Boolean(ctx.grant("documents.share"))
  const now = new Date()
  return rows.map((l) => ({
    // The token is the link itself: only people who may share see (and revoke) it
    token: canSeeTokens ? l.token : null,
    url: canSeeTokens ? shareUrl(ctx.tenant, l.token) : null,
    note: l.note ?? "",
    state: linkState(l, now),
    expiresAt: l.expiresAt,
    revokedAt: l.revokedAt,
    views: l.views,
    lastViewedAt: l.lastViewedAt,
    createdAt: l.createdAt,
    by: people.get(l.createdBy)?.name ?? null,
    opens: views
      .filter((v) => v.linkId === l.id)
      .slice(0, 20)
      .map((v) => ({ at: v.at, device: device(v.userAgent) })),
    ...(withAsset ? { assetId: l.assetId } : {}),
  }))
}

// "Chrome on Android" from a user agent, enough to tell opens apart
function device(ua = "") {
  if (!ua) return null
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null
  return os ? `${browser} on ${os}` : browser
}

// Shared links page: every link on documents this person may see, with the document it opens now
export async function listShareLinks(ctx) {
  const links = await shareLinksFor(ctx, null, { withAsset: true })
  if (!links.length) return []
  const assets = await ctx
    .db("assets")
    .whereIn("id", [...new Set(links.map((l) => l.assetId))])
    .select("id", "code", "title", "mime", "category", "deletedAt")
  const byId = new Map(assets.map((a) => [a.id, a]))
  return links
    .filter((l) => byId.get(l.assetId) && ctx.canSeeType(byId.get(l.assetId).category))
    .map(({ assetId, ...l }) => {
      const a = byId.get(assetId)
      return { ...l, doc: { code: a.code, title: a.title, mime: a.mime, type: a.category, removed: Boolean(a.deletedAt) } }
    })
}

// Projects for pickers and filters
export const projectOptions = (ctx) => live(ctx.db, "projects").orderBy("name").select("code", "name")

// What the pages' buttons may offer (actions check again)
export const documentsCan = (ctx) => ({
  create: ctx.can("create"),
  edit: ctx.can("edit"),
  delete: ctx.can("delete"),
  expiry: ctx.has("expiry"),
  share: ctx.has("sharing") && Boolean(ctx.grant("documents.share")),
})

// ---------- files other apps keep ----------

const COLLECTION_LABELS = { images: "Photo", documents: "Document", proof: "Proof of payment", attachments: "Attachment", voice: "Voice note", files: "File" }

// Files of one app source (Project files, Booking files…) this person may open there, newest
// first, each with the record it belongs to and a link back. Private files need edit in that
// app; booking files follow Operations' record scope (bookings they or their teams handle or sold).
//   → { source, files: [{ code, title, fileName, mime, size, kind, record: { label, href }, addedAt, uploader, url }] }
export async function listAppFiles(ctx, key) {
  const source = APP_SOURCES.find((s) => s.key === key)
  if (!source || !ctx.canApp(source.app)) return null
  const full = isFullAccess(ctx.permissions)
  let rows = await live(ctx.db, "assets").where({ app: source.app }).whereIn("ownerType", source.ownerTypes).orderBy("createdAt", "desc").orderBy("id", "desc").limit(1000)
  if (!full && !ctx.canApp(source.app, "edit")) rows = rows.filter((a) => !a.isPrivate)

  const ids = (type) => [...new Set(rows.filter((a) => a.ownerType === type).map((a) => a.ownerId))]
  const records = new Map() // "type:id" → { label, href }
  let lists = {}

  if (source.app === "portfolio") {
    const updates = ids("project_update").length ? await ctx.db("projectUpdates").whereIn("id", ids("project_update")).select("id", "projectId", "title") : []
    const projectIds = [...new Set([...ids("project"), ...updates.map((u) => u.projectId)])]
    const projects = new Map((projectIds.length ? await live(ctx.db, "projects").whereIn("id", projectIds).select("id", "code", "name") : []).map((p) => [p.id, p]))
    for (const [id, p] of projects) records.set(`project:${id}`, { label: p.name, href: `/project-portfolio/projects/${p.code.toLowerCase()}` })
    for (const u of updates) {
      const p = projects.get(u.projectId)
      if (p) records.set(`project_update:${u.id}`, { label: `${p.name} · ${u.title}`, href: `/project-portfolio/projects/${p.code.toLowerCase()}` })
    }
    lists = await getLookups(ctx.db, ["project-document-type"])
  }

  if (source.app === "operations") {
    // Which booking each file belongs to: its folder, else its owner (receipt, activity)
    const [receipts, activities, folders] = await Promise.all([
      ids("receipt").length ? ctx.db("receipts").whereIn("id", ids("receipt")).select("id", "bookingId") : [],
      ids("booking-activity").length ? ctx.db("bookingActivities").whereIn("id", ids("booking-activity")).select("id", "bookingId") : [],
      rows.some((a) => a.folderId)
        ? ctx
            .db("assetFolders")
            .whereIn("id", [...new Set(rows.map((a) => a.folderId).filter(Boolean))])
            .where({ ownerType: "booking" })
            .select("id", "ownerId")
        : [],
    ])
    const folderBooking = new Map(folders.map((f) => [f.id, f.ownerId]))
    const ownerBooking = new Map([...receipts.map((r) => [`receipt:${r.id}`, r.bookingId]), ...activities.map((r) => [`booking-activity:${r.id}`, r.bookingId])])
    const bookingOf = (a) => (a.folderId && folderBooking.get(a.folderId)) || (a.ownerType === "booking" ? a.ownerId : ownerBooking.get(`${a.ownerType}:${a.ownerId}`))
    const bookingIds = [...new Set(rows.map(bookingOf).filter(Boolean))]
    const sales = await salesContext("/documents")
    const visible = bookingIds.length ? await scoped(sales, live(ctx.db, "bookings").whereIn("bookings.id", bookingIds)).select("bookings.id", "bookings.code", "bookings.customerName") : []
    const byId = new Map(visible.map((b) => [b.id, b]))
    rows = rows.filter((a) => byId.has(bookingOf(a)))
    for (const a of rows) {
      const b = byId.get(bookingOf(a))
      records.set(`${a.ownerType}:${a.ownerId}`, { label: `${b.code} · ${b.customerName}`, href: `/operations/bookings/${b.code.toLowerCase()}` })
    }
    lists = await getLookups(ctx.db, ["booking-document"])
  }

  if (source.app === "campaigns") {
    const pages = ids("landing-page").length ? await live(ctx.db, "landingPages").whereIn("id", ids("landing-page")).select("id", "code", "name") : []
    for (const p of pages) records.set(`landing-page:${p.id}`, { label: p.name, href: `/campaigns/pages/${p.code.toLowerCase()}` })
  }

  // Files whose record was removed don't show
  rows = rows.filter((a) => records.has(`${a.ownerType}:${a.ownerId}`))
  const kinds = new Map([...(lists["project-document-type"] ?? []), ...(lists["booking-document"] ?? [])].map((l) => [l.value, l.label]))
  const people = await peopleByIds(rows.map((a) => a.createdBy))
  return {
    source,
    files: rows.map((a) => ({
      code: a.code,
      title: a.title,
      fileName: a.fileName,
      mime: a.mime,
      size: a.size,
      kind: (a.category && kinds.get(a.category)) || COLLECTION_LABELS[a.collection] || "File",
      isPrivate: a.isPrivate,
      record: records.get(`${a.ownerType}:${a.ownerId}`),
      addedAt: a.createdAt,
      uploader: people.get(a.createdBy)?.name ?? null,
      url: assetUrl(a.code),
    })),
  }
}
