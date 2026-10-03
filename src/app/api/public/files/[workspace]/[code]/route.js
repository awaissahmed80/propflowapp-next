import { NextResponse } from "next/server"
import { readFile } from "@/server/storage"
import { findAsset } from "@/server/assets"
import { publicWorkspace } from "@/modules/campaigns/server/forms"

// GET /api/public/files/<workspace>/<code> → an image on a public landing page (no sign-in).
// Only Campaigns' own non-private files (uploaded in the page builder) are served here.
export async function GET(request, { params }) {
  const { workspace, code } = await params
  const site = await publicWorkspace(workspace)
  if (!site) return new NextResponse("Not found", { status: 404 })
  const asset = await findAsset(site.db, code)
  if (!asset || asset.app !== "campaigns" || asset.isPrivate) return new NextResponse("Not found", { status: 404 })
  let bytes
  try {
    bytes = await readFile(asset.fileKey)
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": asset.mime,
      "Content-Disposition": `inline; filename="${asset.fileName.replace(/[^\w.\- ]+/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      // Files never change under the same code
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
