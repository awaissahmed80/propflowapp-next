// Expiry dates on documents (dates only, Pakistan time), shared by pages and the server.
//   expired: before today · soon: within 30 days · later: within 90 days · valid: further off

const DAY = 86_400_000
export const SOON_DAYS = 30
export const WATCH_DAYS = 90

// Today in Pakistan: "2026-10-04"
export const todayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d)

// A day plus or minus n days: addDays("2026-10-04", 30) → "2026-11-03"
export const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

// Whole days from today to the date (negative: already past), or null without a date
export const daysLeft = (expiresOn, today = todayKey()) => (expiresOn ? Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) : null)

export function expiryState(days) {
  if (days == null) return null
  if (days < 0) return "expired"
  if (days <= SOON_DAYS) return "soon"
  if (days <= WATCH_DAYS) return "later"
  return "valid"
}

export const EXPIRY_FILTERS = [
  { value: "expired", label: "Expired" },
  { value: "soon", label: `Within ${SOON_DAYS} days` },
  { value: "later", label: `Within ${WATCH_DAYS} days` },
  { value: "valid", label: "Valid longer" },
  { value: "none", label: "No expiry date" },
]
