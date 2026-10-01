import { headers } from "next/headers"
import { siteForHost, siteUrl } from "@/lib/sites"

// robots.txt for every subdomain: the website is open to search engines, the portal, sign-in
// and console are not.
export default async function robots() {
  const site = siteForHost((await headers()).get("host"))
  if (site !== "web") return { rules: { userAgent: "*", disallow: "/" } }
  return { rules: { userAgent: "*", allow: "/" }, sitemap: siteUrl("web", "/sitemap.xml") }
}
