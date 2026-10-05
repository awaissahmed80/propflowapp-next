import { NextResponse } from "next/server"
import { uploadDocuments, uploadNewVersion } from "@/modules/documents/server/actions"

// POST /api/documents/upload (multipart) → the Documents upload dialog. A route rather than a
// server action so files up to 20 MB get through (server actions stop at 11 MB). The same
// checks as the actions run inside them.
//   files[], type, project, expiresOn, note, title       new documents
//   replaces=<asset code>, files[0], expiresOn?, note?   a new version of that document
export async function POST(request) {
  // Only from the portal's own pages (the browser sends Origin on every POST)
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  let form
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "The upload didn't arrive in one piece. Try again." }, { status: 400 })
  }
  const replaces = form.get("replaces")
  const result = replaces ? await uploadNewVersion(String(replaces), form) : await uploadDocuments(form)
  return NextResponse.json(result)
}
