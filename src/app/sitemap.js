import { headers } from "next/headers"
import { siteForHost, siteUrl } from "@/lib/sites"
import { LEGAL_VERSION } from "@/modules/web/legal"
import { PRODUCT_PAGES } from "@/modules/web/site/pages"
import SCREENS from "@/modules/web/screens.json"

// When the website's pages last changed. Bump it when page content changes, so search engines
// recrawl (an honest date matters: Google ignores lastmod on sites where it is always "now").
const SITE_UPDATED = "2026-11-12"

// The screenshots a page shows, as image entries, so they can be found in image search
const images = (...screens) => [...new Set(screens.filter(Boolean))].filter((k) => SCREENS[k]).map((k) => siteUrl("web", SCREENS[k].src))

// sitemap.xml: the website's pages only (the other subdomains aren't indexed)
export default async function sitemap() {
  if (siteForHost((await headers()).get("host")) !== "web") return []
  const page = (path, priority, changeFrequency = "monthly", screens = []) => ({
    url: siteUrl("web", path),
    lastModified: SITE_UPDATED,
    changeFrequency,
    priority,
    ...(screens.length && { images: images(...screens) }),
  })
  return [
    page("", 1, "weekly", ["portfolio-overview", ...PRODUCT_PAGES.map((p) => p.hero.screen)]),
    ...PRODUCT_PAGES.map((p) => page(`/${p.slug}`, 0.9, "monthly", [p.hero.screen, ...p.modules.map((m) => m.screen)])),
    page("/book-a-demo", 0.9),
    page("/pricing", 0.8, "weekly"),
    page("/why-propflow", 0.7),
    page("/mobile-app", 0.7),
    { url: siteUrl("web", "/privacy-policy"), lastModified: LEGAL_VERSION, changeFrequency: "yearly", priority: 0.2 },
    { url: siteUrl("web", "/terms-and-conditions"), lastModified: LEGAL_VERSION, changeFrequency: "yearly", priority: 0.2 },
  ]
}
