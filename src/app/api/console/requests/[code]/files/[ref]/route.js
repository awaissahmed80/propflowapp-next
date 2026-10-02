import { NextResponse } from "next/server"
import { getSession, getStaffRole } from "@/server/auth/dal"
import { platformDb } from "@/server/db/connections"
import { readFile } from "@/server/storage"
import { canView } from "@/modules/console/roles"
import { fromUrlCode } from "@/lib/url"

// GET /api/console/requests/REQ-26-0004/files/<ref> → a screenshot attached to the request, for
// console staff who can see Workspace Requests. ref is the file's random id, never a table id.
export async function GET(request, { params }) {
  const session = await getSession()
  const role = session?.kind === "console" ? await getStaffRole(session.user.id) : null
  if (!role || !canView(role, "requests")) return new NextResponse("Not allowed", { status: 403 })

  const p = await params
  const ref = String(p.ref)
  if (!/^[a-f0-9]{24}$/.test(ref)) return new NextResponse("Not found", { status: 404 })
  const rows = await platformDb()("supportMessages as m")
    .join("supportRequests as r", "r.id", "m.requestId")
    .where("r.code", fromUrlCode(p.code))
    .whereNull("r.deletedAt")
    .whereNotNull("m.attachments")
    .select("m.attachments")
  const file = rows.flatMap((r) => (typeof r.attachments === "string" ? JSON.parse(r.attachments) : r.attachments) ?? []).find((a) => a.ref === ref)
  if (!file) return new NextResponse("Not found", { status: 404 })

  let bytes
  try {
    bytes = await readFile(file.key)
  } catch {
    return new NextResponse("The file is missing from storage", { status: 404 })
  }
  const name = (file.name || "screenshot").replace(/[^\w.\- ]+/g, "_")
  const download = request.nextUrl.searchParams.get("download") === "1"
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  })
}
