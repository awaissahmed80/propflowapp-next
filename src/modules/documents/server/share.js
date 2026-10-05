import "server-only"
import crypto from "node:crypto"
import { live } from "@/server/db/records"
import { publicWorkspace } from "@/modules/campaigns/server/forms"

// Share links from outside the workspace (no sign-in): campaigns.<root>/d/<workspace>/<token>
// shows the document, /api/public/share/<workspace>/<token> serves its file. A link opens the
// latest version of the document it was made for, until it expires or is revoked; nothing else
// (no other file, no ids) is reachable through it.

const TOKEN = /^[A-Za-z0-9_-]{20,40}$/

// The current version after this asset (links follow a document to its newest upload)
async function latest(db, asset) {
  let at = asset
  for (let i = 0; i < 500 && at.supersededAt; i++) {
    const next = await live(db, "assets").where({ replacesId: at.id }).first()
    if (!next) break
    at = next
  }
  return at
}

// → { state: "ok", tenant, db, link, asset } | { state: "expired" | "missing", tenant? }
export async function openShare(workspace, token) {
  if (!TOKEN.test(String(token ?? ""))) return { state: "missing" }
  const site = await publicWorkspace(workspace)
  if (!site) return { state: "missing" }
  const { tenant, db } = site
  const link = await live(db, "shareLinks").where({ token }).first()
  if (!link) return { state: "missing", tenant }
  if (link.revokedAt || new Date(link.expiresAt) <= new Date()) return { state: "expired", tenant, link }
  const asset = await live(db, "assets").where({ id: link.assetId, app: "documents" }).first()
  if (!asset) return { state: "expired", tenant, link }
  return { state: "ok", tenant, db, link, asset: await latest(db, asset) }
}

// Count an open and log it (the address is hashed with a server secret, never kept)
export async function logShareOpen(db, link, headers) {
  const ip = headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const secret = process.env.SHARE_LINK_SECRET || process.env.SESSION_SECRET || ""
  const now = new Date()
  await db("shareLinks")
    .where({ id: link.id })
    .update({ views: db.raw("views + 1"), lastViewedAt: now })
  await db("shareLinkViews").insert({
    linkId: link.id,
    at: now,
    ipHash: ip ? crypto.createHash("sha256").update(`${secret}:${ip}`).digest("hex") : null,
    userAgent: headers.get("user-agent")?.slice(0, 255) ?? null,
  })
}
