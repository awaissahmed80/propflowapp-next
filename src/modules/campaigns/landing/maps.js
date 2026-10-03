// Google Maps links on landing pages. People paste whatever Google gives them: a share link
// (short maps.app.goo.gl ones are expanded on save, see page-actions), a full maps address, or
// the "Embed a map" code. → { embed: iframe src | null, link: where "Get directions" goes | null }

const isShort = (u) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(u)
export const isShortMapLink = isShort

export function parseMapLink(input) {
  let raw = String(input ?? "").trim()
  if (!raw) return { embed: null, link: null }
  // The "Embed a map" code: take its address
  const src = raw.match(/src=["']([^"']+)["']/i)
  if (src) raw = src[1].replace(/&amp;/g, "&")
  let url
  try {
    url = new URL(raw)
  } catch {
    return { embed: null, link: null }
  }
  if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && !isShort(raw)) return { embed: null, link: null }
  if (url.pathname.startsWith("/maps/embed")) return { embed: url.toString(), link: null }
  if (isShort(raw)) return { embed: null, link: url.toString() } // not expanded yet (expanded on save)
  const at = raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1]
  const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? (place ? decodeURIComponent(place.replace(/\+/g, " ")) : null)
  const where = at ? `${at[1]},${at[2]}` : q
  if (!where) return { embed: null, link: url.toString() }
  return { embed: `https://maps.google.com/maps?q=${encodeURIComponent(where)}&z=${at ? 16 : 14}&output=embed`, link: url.toString() }
}
