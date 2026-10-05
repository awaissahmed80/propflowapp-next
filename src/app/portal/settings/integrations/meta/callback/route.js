import { NextResponse } from "next/server"
import { siteUrl } from "@/lib/sites"

// Facebook Login's return address can also be https://portal.<root>/settings/integrations/meta/callback
// (META_REDIRECT_URI): straight on to /api/meta/callback, which finishes the connection
export function GET(request) {
  return NextResponse.redirect(siteUrl("portal", `/api/meta/callback${request.nextUrl.search}`))
}
