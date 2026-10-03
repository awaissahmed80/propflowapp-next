import { formatPkr } from "@/lib/format"

// Campaigns helpers shared by the server and the browser. Lists (statuses, objectives, channels)
// come from the workspace's lookups: channels are CRM lead sources, so a lead's source tells which
// channel of a campaign it came from.

const CHANNEL_ICONS = {
  "facebook-ads": "facebook-circle-line",
  instagram: "instagram-line",
  "google-ads": "google-line",
  "property-portal": "home-smile-2-line",
  sms: "message-2-line",
  expo: "store-2-line",
  "walk-in": "walk-line",
  "site-office": "map-pin-user-line",
  dealer: "shake-hands-line",
  "customer-referral": "user-shared-line",
  phone: "phone-line",
}
export const channelIcon = (key) => CHANNEL_ICONS[key] ?? "megaphone-line"

// Channels billed by impressions / clicks, where the ad platform reports reach
export const AD_PLATFORMS = ["facebook-ads", "instagram", "google-ads"]

// UTM tags for tracking links, per channel
const UTM = {
  "facebook-ads": ["facebook", "paid-social"],
  instagram: ["instagram", "paid-social"],
  "google-ads": ["google", "cpc"],
  "property-portal": ["portal", "listing"],
  sms: ["sms", "sms"],
  expo: ["expo", "qr"],
}
export const utmFor = (channel) => UTM[channel] ?? [channel, "referral"]

// utm_source → channel, so a link's tag decides which campaign channel gets the lead
export const channelFromUtm = (source) =>
  ({ facebook: "facebook-ads", fb: "facebook-ads", instagram: "instagram", ig: "instagram", google: "google-ads", portal: "property-portal", sms: "sms", expo: "expo", qr: "expo" })[(source ?? "").toLowerCase()] ?? null

// Goals are worked out from CRM results, so the metrics are fixed
export const GOAL_METRICS = [
  { value: "leads", label: "Leads", icon: "user-add-line" },
  { value: "site-visits", label: "Site visits", icon: "map-pin-user-line" },
  { value: "bookings", label: "Bookings", icon: "hand-coin-line" },
  { value: "cpl", label: "Cost per lead", icon: "price-tag-3-line", money: true, lowerIsBetter: true },
]
export const GOAL_METRIC = Object.fromEntries(GOAL_METRICS.map((g) => [g.value, g]))
export const formatGoal = (metric, v) => (v == null ? "—" : GOAL_METRIC[metric]?.money ? formatPkr(v) : new Intl.NumberFormat("en-PK").format(v))

const DAY = 86_400_000
const short = (d, year) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year && { year: "numeric" }) })

// "12 Aug – 28 Oct 2026", "From 12 Aug 2026", "Not scheduled"
export function dateRange(c) {
  if (!c.startDate) return "Not scheduled"
  if (!c.endDate) return `From ${short(c.startDate, true)}`
  if (c.startDate === c.endDate) return short(c.startDate, true)
  return `${short(c.startDate)} – ${short(c.endDate, true)}`
}

// "18 days left", "Starts in 3 days", "Ended 2 days ago"
export function timing(c, now = Date.now()) {
  const start = c.startDate ? new Date(c.startDate).getTime() : null
  const end = c.endDate ? new Date(c.endDate).getTime() + DAY : null
  const days = (ms) => Math.max(1, Math.round(ms / DAY))
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`
  if (!start) return "Draft"
  if (start > now) return `Starts in ${plural(days(start - now), "day")}`
  if (end && end < now) return `Ended ${plural(days(now - end), "day")} ago`
  if (end) return `${plural(days(end - now), "day")} left`
  return `Running ${plural(days(now - start), "day")}`
}

// Status as it is today: live/scheduled past the end date → ended; scheduled past the start → live
export function displayStatus(c, now = new Date()) {
  const day = now.toISOString().slice(0, 10)
  if (["active", "scheduled"].includes(c.status) && c.endDate && c.endDate < day) return "completed"
  if (c.status === "scheduled" && c.startDate && c.startDate <= day) return "active"
  return c.status
}

export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
export const percent = (r) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`)

// Brand accents for public forms and landing pages (always rendered on a light page)
export const ACCENTS = { blue: "#0270d2", sky: "#0284c7", teal: "#0f766e", green: "#15803d", amber: "#b45309", red: "#b91c1c", violet: "#6d28d9", gray: "#334155" }
export const ACCENT_OPTIONS = Object.keys(ACCENTS).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))
// A named accent, or any hex the page picked
export const accentHex = (key) => ACCENTS[key] ?? (/^#[0-9a-f]{6}$/i.test(key ?? "") ? key : ACCENTS.blue)

// Field types for the form builder. Contact fields fill the lead and contact; "mapTo" fills the
// lead's interest; anything else is kept in the lead's notes as "Label: answer".
export const FIELD_TYPES = {
  name: { label: "Full name", icon: "user-line", fixed: true },
  phone: { label: "Mobile", icon: "smartphone-line", fixed: true },
  email: { label: "Email", icon: "mail-line" },
  city: { label: "City", icon: "map-pin-2-line" },
  text: { label: "Short answer", icon: "text" },
  textarea: { label: "Long answer", icon: "align-left" },
  select: { label: "Dropdown", icon: "arrow-down-s-line", options: true },
  radio: { label: "Choice", icon: "radio-button-line", options: true },
  checkbox: { label: "Tick box", icon: "checkbox-line" },
  consent: { label: "Consent", icon: "shield-check-line" },
}

// Ready-made fields for Pakistani property enquiries
export const FIELD_PRESETS = [
  { key: "email", label: "Email", field: { type: "email", label: "Email", placeholder: "you@example.com" } },
  { key: "city", label: "City", field: { type: "city", label: "City" } },
  { key: "size", label: "Plot size", field: { type: "select", label: "Plot size", mapTo: "size", options: ["5 Marla", "10 Marla", "1 Kanal"] } },
  { key: "unit", label: "Unit type", field: { type: "select", label: "Interested in", mapTo: "unitType", options: ["Plot", "File", "House", "Apartment", "Shop", "Office"] } },
  { key: "budget", label: "Budget", field: { type: "select", label: "Budget", mapTo: "budget", options: ["Up to 50 Lac", "50 Lac – 1 Crore", "1 – 2 Crore", "2 Crore +"] } },
  { key: "plan", label: "Payment plan", field: { type: "radio", label: "How would you like to pay?", mapTo: "paymentPlan", options: ["Installments", "Full payment"] } },
  { key: "overseas", label: "Overseas Pakistani", field: { type: "checkbox", label: "I live abroad (overseas Pakistani)", mapTo: "overseas" } },
  { key: "time", label: "Best time to call", field: { type: "select", label: "Best time to call", options: ["Morning", "Afternoon", "Evening"] } },
  { key: "cnic", label: "CNIC", field: { type: "text", label: "CNIC", placeholder: "35202-1234567-1" } },
  { key: "message", label: "Message", field: { type: "textarea", label: "Message", mapTo: "notes", placeholder: "Anything you'd like us to know" } },
  { key: "consent", label: "Consent", field: { type: "consent", label: "I agree to be contacted by phone and WhatsApp", required: true } },
  { key: "text", label: "Custom short answer", field: { type: "text", label: "Your question" } },
  { key: "select", label: "Custom dropdown", field: { type: "select", label: "Your question", options: ["Option 1", "Option 2"] } },
]

// Where a mapped field ends up on the lead
export const MAP_TARGETS = {
  size: "Lead interest › size",
  unitType: "Lead interest › unit type",
  budget: "Lead interest › budget",
  paymentPlan: "Lead interest › payment",
  overseas: "Lead › overseas",
  notes: "Lead notes",
}

// "Up to 50 Lac" → { min: null, max: 5000000 }; "1 – 2 Crore" → { min: 1e7, max: 2e7 }
export function parseBudget(label) {
  const text = String(label ?? "").toLowerCase()
  const unit = /crore|cr\b/.test(text) ? 1e7 : /lac|lakh/.test(text) ? 1e5 : 1
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
  if (!nums.length) return { min: null, max: null }
  // "50 Lac – 1 Crore": the first number's own unit
  const firstUnit = /^\D*\d+(?:\.\d+)?\s*(lac|lakh)/.test(text) && unit === 1e7 ? 1e5 : unit
  if (/up to|under|below/.test(text)) return { min: null, max: nums[0] * unit }
  if (/\+|above|over/.test(text)) return { min: nums[0] * unit, max: null }
  return { min: nums[0] * firstUnit, max: (nums[1] ?? nums[0]) * unit }
}
