import { NextResponse } from "next/server"
import { getSession } from "@/server/auth/dal"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { readFile } from "@/server/storage"
import { findAsset } from "@/server/assets"
import { can, isFullAccess, roleAccess } from "@/modules/users/permissions"

// GET /api/workspace/files/3fa9c0… → a workspace file (any app's asset) for people signed in to
// that workspace whose role can view the file's app (private files: edit). Found by the asset's
// random code, never its row id. ?download=1 saves it instead of showing it.
export async function GET(request, { params }) {
  const session = await getSession()
  if (session?.kind !== "tenant" || !session.tenantId) return new NextResponse("Sign in first", { status: 401 })
  const [membership, tenant] = await Promise.all([
    authDb()("memberships").where({ userId: session.user.id, tenantId: session.tenantId, status: "active" }).whereNull("deletedAt").first("roleId"),
    live(platformDb(), "tenants").where({ id: session.tenantId }).first("dbName", "dbHost", "status"),
  ])
  if (!membership || !tenant || !["trial", "active", "past_due"].includes(tenant.status)) return new NextResponse("Not allowed", { status: 403 })

  const db = tenantDb(tenant)
  const { code } = await params
  const [asset, role] = await Promise.all([findAsset(db, code), live(db, "roles").where({ id: membership.roleId }).first("permissions", "scope", "grants")])
  if (!asset) return new NextResponse("Not found", { status: 404 })
  const permissions = role?.permissions ?? []
  if (!isFullAccess(permissions) && !can(permissions, asset.app, asset.isPrivate ? "edit" : "view")) return new NextResponse("Not allowed", { status: 403 })
  // A booking's private folder: only people who may see that booking (their Sales scope)
  if (asset.folderId && !(await canSeeFolder(db, asset.folderId, session.user.id, role))) return new NextResponse("Not allowed", { status: 403 })

  let bytes
  try {
    bytes = await readFile(asset.fileKey)
  } catch {
    return new NextResponse("The file is missing from storage", { status: 404 })
  }
  const download = request.nextUrl.searchParams.get("download") === "1"
  const name = asset.fileName.replace(/[^\w.\- ]+/g, "_")
  const headers = {
    "Content-Type": asset.mime,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  }
  // Byte ranges, so audio (voice notes) can play and seek, which Safari requires
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "")
  if (range) {
    const size = bytes.length
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(size - 1, end)
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
    return new NextResponse(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } })
  }
  return new NextResponse(bytes, { headers })
}

// Files in a record's own folder follow that record's visibility. Bookings: Sales scope own (they
// handle it) / team (someone in their teams handles it) / all.
async function canSeeFolder(db, folderId, userId, role) {
  const folder = await live(db, "assetFolders").where({ id: folderId }).first("ownerType", "ownerId")
  if (folder?.ownerType !== "booking") return true
  const { scope } = roleAccess({ permissions: role?.permissions ?? [], scope: role?.scope, grants: role?.grants })
  if (scope.operations === "all") return true
  const booking = await live(db, "bookings").where({ id: folder.ownerId }).first("agentId")
  if (!booking) return false
  if (booking.agentId === userId) return true
  if (scope.operations !== "team") return false
  const [me, led, agent] = await Promise.all([
    live(db, "members").where({ userId }).first("teamId"),
    live(db, "teams").where({ leadUserId: userId }).select("id"),
    live(db, "members").where({ userId: booking.agentId }).first("teamId"),
  ])
  const mine = new Set([me?.teamId, ...led.map((t) => t.id)].filter(Boolean))
  return Boolean(agent?.teamId && mine.has(agent.teamId))
}
