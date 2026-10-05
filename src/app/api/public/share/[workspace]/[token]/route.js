import { NextResponse } from "next/server"
import { readFile } from "@/server/storage"
import { openShare } from "@/modules/documents/server/share"

// GET /api/public/share/<workspace>/<token> → the shared document's file (latest version), while
// the link is valid; ?download=1 saves it. Opens are logged by the share page itself.
export async function GET(request, { params }) {
  const { workspace, token } = await params
  const found = await openShare(workspace, token)
  if (found.state !== "ok") return new NextResponse(found.state === "expired" ? "This link has expired" : "Not found", { status: found.state === "expired" ? 410 : 404 })
  let bytes
  try {
    bytes = await readFile(found.asset.fileKey)
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  const ext = found.asset.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ""
  const name = `${found.asset.title}${ext}`.replace(/[^\w.\- ]+/g, "_")
  const download = request.nextUrl.searchParams.get("download") === "1"
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": found.asset.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  })
}
