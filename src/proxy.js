import { NextResponse } from "next/server"
import { siteForHost } from "@/lib/sites"
import { APP_SLUGS, OLD_SLUGS } from "@/modules/portal/app-paths"

// One Next app, several subdomains. Each request is rewritten to the folder of its site:
//   auth.propflowapp.test/forgot-password  →  src/app/auth/forgot-password
// The browser keeps the clean URL. Unknown hosts get a 404.
export function proxy(request) {
  const site = siteForHost(request.headers.get("host"))
  if (!site) return new NextResponse("Not found", { status: 404 })

  const url = request.nextUrl.clone()
  // Site folders are internal; /auth/... typed on another subdomain must not reach them.
  // ("campaigns" is also the portal's Campaigns app, portal.<root>/campaigns; every path is
  // prefixed with its own site below, so that never reaches the public campaigns site.)
  const first = url.pathname.split("/")[1]
  if (["web", "auth", "portal", "console"].includes(first)) {
    return new NextResponse("Not found", { status: 404 })
  }
  // Apps that moved to friendlier URLs (/sales → /operations): old links in notifications and bookmarks still work
  const moved = site === "portal" && Object.keys(OLD_SLUGS).find((code) => OLD_SLUGS[code].includes(first))
  if (moved) {
    url.pathname = `/${APP_SLUGS[moved]}${url.pathname.slice(first.length + 1)}`
    return NextResponse.redirect(url, 308)
  }
  url.pathname = `/${site}${url.pathname === "/" ? "" : url.pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Skip Next internals, API routes and files in public/
  matcher: ["/((?!_next/|api/|images/|favicon\\.svg|apple-touch-icon\\.png|embed\\.js|robots\\.txt|sitemap\\.xml).*)"],
}
