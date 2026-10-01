// Workspace short names ("slugs"): lowercase letters, numbers and dashes, used in links.
// Shared by the setup form (live check) and the server (final check).

export const SLUG_MIN = 3
export const SLUG_MAX = 40

// Names that would clash with PropFlow's own addresses or look official
const RESERVED = new Set([
  "www", "auth", "portal", "console", "campaigns", "api", "app", "apps", "admin", "administrator", "mail", "email",
  "help", "support", "status", "docs", "blog", "about", "pricing", "login", "signin", "signup", "register", "account",
  "billing", "settings", "static", "assets", "cdn", "images", "files", "propflow", "propflowapp", "test", "demo", "root", "system",
])

// "Skyline Developers (Pvt) Ltd." → "skyline-developers"
export function suggestSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\((pvt|private)\)|\b(pvt|private|ltd|limited|llc|inc|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "")
}

// null when fine, otherwise the reason
export function slugProblem(slug) {
  if (!slug) return "Choose a short name."
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`
  if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(slug)) return "Use lowercase letters, numbers and dashes, starting with a letter."
  if (slug.includes("--")) return "Don't use two dashes in a row."
  if (RESERVED.has(slug)) return "That name is reserved. Try another."
  return null
}
