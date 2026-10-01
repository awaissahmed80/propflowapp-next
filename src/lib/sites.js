// One app serves several subdomains; the site is picked from the hostname:
//   <root>             → web        marketing site
//   auth.<root>        → auth       central sign-in
//   portal.<root>      → portal     workspaces (tenant ERP)
//   console.<root>     → console    platform owner
//   campaigns.<root>   → campaigns  public landing pages and forms
// Works on the server and in the browser (NEXT_PUBLIC_ values are inlined at build time).

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "propflowapp.test"
const PROTOCOL = process.env.NEXT_PUBLIC_APP_PROTOCOL || "https"

export const SITES = { web: null, auth: "auth", portal: "portal", console: "console", campaigns: "campaigns" }

// "auth.propflowapp.test:443" → "auth"; unknown hosts → null
export function siteForHost(host) {
  const hostname = String(host ?? "").split(":")[0].toLowerCase()
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return "web"
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null
  const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1))
  return Object.keys(SITES).find((k) => SITES[k] === sub) ?? null
}

// Absolute URL on another site: siteUrl("console", "/tenants")
export function siteUrl(site, path = "/") {
  const sub = SITES[site]
  return `${PROTOCOL}://${sub ? `${sub}.` : ""}${ROOT_DOMAIN}${path.startsWith("/") ? path : `/${path}`}`
}

// Only send people back into PropFlow after sign-in, never to another website
export function isSafeRedirect(target) {
  try {
    const url = new URL(target)
    return url.protocol === `${PROTOCOL}:` && siteForHost(url.host) !== null
  } catch {
    return false
  }
}
