import { NextResponse } from "next/server"
import { siteForHost } from "@/lib/sites"

// One Next app, several subdomains. Each request is rewritten to the folder of its site:
//   auth.propflowapp.test/forgot-password  →  src/app/auth/forgot-password
// The browser keeps the clean URL. Unknown hosts get a 404.
export function proxy(request) {
  const site = siteForHost(request.headers.get("host"))
  if (!site) return new NextResponse("Not found", { status: 404 })

  const url = request.nextUrl.clone()
  // Site folders are internal; /auth/... typed on another subdomain must not reach them
  const first = url.pathname.split("/")[1]
  if (["web", "auth", "portal", "console", "campaigns"].includes(first)) {
    return new NextResponse("Not found", { status: 404 })
  }
  url.pathname = `/${site}${url.pathname === "/" ? "" : url.pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Skip Next internals, API routes and files in public/
  matcher: ["/((?!_next/|api/|images/|favicon\\.svg|apple-touch-icon\\.png|robots\\.txt|sitemap\\.xml).*)"],
}
