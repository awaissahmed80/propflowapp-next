// Lead settings for Facebook & Instagram lead ads (Configure › Lead settings), shared by the
// server and the browser. Kept in the workspace's settings table under META_SETTINGS_KEY.

export const META_SETTINGS_KEY = "meta_lead_settings"

// Leads always arrive in real time (Meta's webhook); these add a check for any it missed
export const SYNC_OPTIONS = [
  { value: "realtime", label: "Real-time" },
  { value: "15m", label: "Real-time, and check every 15 minutes" },
  { value: "hourly", label: "Real-time, and check every hour" },
  { value: "daily", label: "Real-time, and check once a day" },
]
export const SYNC_MINUTES = { "15m": 15, hourly: 60, daily: 1440 }

export const DEFAULT_META_SETTINGS = {
  sync: "realtime",
  owner: "round-robin", // round-robin | "" (unassigned) | a user id
  stage: "new", // a lead status (open ones only)
  notify: true, // bell for whoever gets the lead
  dedupeEmail: false, // the same email is the same person, not only the same mobile
  noteSource: true, // "Facebook lead ad · <form>" as the lead's first note line
}

export function mergeMetaSettings(saved) {
  const v = saved && typeof saved === "object" ? saved : {}
  const out = { ...DEFAULT_META_SETTINGS, ...v }
  if (!SYNC_OPTIONS.some((o) => o.value === out.sync)) out.sync = DEFAULT_META_SETTINGS.sync
  out.owner = out.owner == null ? "" : String(out.owner)
  return out
}
