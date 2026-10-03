import { formatSize } from "@/modules/portfolio/constants"

// CRM helpers used on the server and in the browser.

// One-tap answers after a call or WhatsApp. moves: the status it brings an earlier lead up to.
export const OUTCOMES = [
  { value: "interested", label: "Interested", icon: "thumb-up-line", tone: "text-emerald-600 dark:text-emerald-400", moves: "interested" },
  { value: "call-back", label: "Call back", icon: "time-line", tone: "text-sky-600 dark:text-sky-400", moves: "contacted" },
  { value: "no-answer", label: "No answer", icon: "phone-off-line", tone: "text-amber-600 dark:text-amber-400" },
  { value: "not-interested", label: "Not interested", icon: "thumb-down-line", tone: "text-red-600 dark:text-red-400", moves: "contacted" },
]
export const outcomeLabel = (v) => OUTCOMES.find((o) => o.value === v)?.label ?? v

export const PAYMENT_PLANS = [
  { value: "installments", label: "Installments" },
  { value: "cash", label: "Cash / lump sum" },
]
export const PURPOSES = [
  { value: "investment", label: "Investment" },
  { value: "living", label: "To live in" },
]

// The open path a lead walks; Booked and Lost close it
export const OPEN_STEPS = ["new", "contacted", "interested", "site-visit", "negotiation"]
export const stepIndex = (status) => OPEN_STEPS.indexOf(status)

// When the next follow-up should be: tomorrow 11 AM, in 3 days, next week (Pakistan time)
export function followUpAt(days, from = new Date(), time = "11:00") {
  // Older callers may still pass a preset name
  const n = typeof days === "number" ? days : ({ tomorrow: 1, "3-days": 3, "next-week": 7 }[days] ?? 1)
  const [h, m] = /^\d{2}:\d{2}$/.test(time ?? "") ? time.split(":").map(Number) : [11, 0]
  const d = new Date(from)
  d.setDate(d.getDate() + n)
  // That time in Pakistan (UTC+5)
  d.setUTCHours(h - 5, m, 0, 0)
  return d
}
export const FOLLOW_UP_PRESETS = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "3-days", label: "In 3 days" },
  { value: "next-week", label: "Next week" },
]

// "ABH · 5 Marla plot", "Any project · Apartment"
export function interestText(i, { typeLabel = (v) => v } = {}) {
  const size = i.sizeValue ? formatSize(i.sizeValue, i.sizeUnit ?? "marla") : null
  const what = [size, i.unitType ? typeLabel(i.unitType).toLowerCase() : null].filter(Boolean).join(" ")
  return [i.project?.name, what && what[0].toUpperCase() + what.slice(1)].filter(Boolean).join(" · ") || "—"
}

// "Rs 50 Lac – 1 Cr" from budgetMin / budgetMax
export function budgetText(i, formatPkr) {
  if (i.budgetMin && i.budgetMax) return `${formatPkr(i.budgetMin)} – ${formatPkr(i.budgetMax).replace("Rs ", "")}`
  if (i.budgetMax) return `Up to ${formatPkr(i.budgetMax)}`
  if (i.budgetMin) return `From ${formatPkr(i.budgetMin)}`
  return null
}
