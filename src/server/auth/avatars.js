// Photos people upload for themselves (My Desk › Profile). Stored under avatars/ in storage and
// shown at /api/avatars/<yyyy>-<mm>-<random>.<ext> on any PropFlow site: the random part can't be
// guessed, like a Google photo address. Photos from Google stay Google addresses.

const FILE = /^(\d{4})-(\d{2})-([a-f0-9]{32})\.(webp|jpg|png)$/

// avatars/2026/10/<hex>.webp → /api/avatars/2026-10-<hex>.webp
export const avatarUrl = (key) => {
  const [, y, m, name] = key.split("/")
  return `/api/avatars/${y}-${m}-${name}`
}

// The storage key behind one of our photo addresses, or null (a Google photo, nothing)
export function avatarKey(url) {
  const file = typeof url === "string" && url.startsWith("/api/avatars/") ? url.slice("/api/avatars/".length) : null
  return keyFor(file)
}

// /api/avatars/<file> → the storage key, or null
export function keyFor(file) {
  const m = typeof file === "string" ? FILE.exec(file) : null
  return m ? `avatars/${m[1]}/${m[2]}/${m[3]}.${m[4]}` : null
}

export const AVATAR_TYPES = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" }
