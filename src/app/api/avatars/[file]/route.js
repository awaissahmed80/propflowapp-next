import { NextResponse } from "next/server"
import { readFile } from "@/server/storage"
import { AVATAR_TYPES, keyFor } from "@/server/auth/avatars"

// GET /api/avatars/<yyyy>-<mm>-<random>.<ext>: a photo someone uploaded for themselves
export async function GET(_request, { params }) {
  const { file } = await params
  const key = keyFor(file)
  if (!key) return new NextResponse("Not found", { status: 404 })
  let bytes
  try {
    bytes = await readFile(key)
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": AVATAR_TYPES[key.split(".").pop()],
      "X-Content-Type-Options": "nosniff",
      // A new photo gets a new address, so this one never changes
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
