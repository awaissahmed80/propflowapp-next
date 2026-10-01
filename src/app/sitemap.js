import { headers } from "next/headers"
import { siteForHost, siteUrl } from "@/lib/sites"
import { LEGAL_VERSION } from "@/modules/web/legal"

// sitemap.xml: the website's pages only (the other subdomains aren't indexed)
export default async function sitemap() {
  if (siteForHost((await headers()).get("host")) !== "web") return []
  return [
    { url: siteUrl("web"), changeFrequency: "weekly", priority: 1 },
    { url: siteUrl("web", "/privacy-policy"), lastModified: LEGAL_VERSION, changeFrequency: "yearly", priority: 0.2 },
    { url: siteUrl("web", "/terms-and-conditions"), lastModified: LEGAL_VERSION, changeFrequency: "yearly", priority: 0.2 },
  ]
}
