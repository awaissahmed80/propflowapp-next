const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function timeAgo(date) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return relative.format(-minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, "hour")
  return relative.format(-Math.round(hours / 24), "day")
}

// Compact PKR for dashboards: Rs 2.45M, Rs 186M, Rs 1.22B
export function formatMoney(amount, currency = "PKR") {
  const symbol = currency === "PKR" ? "Rs " : `${currency} `
  return symbol + new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 }).format(amount)
}

// Always Pakistan time, whether this runs on the server (UTC) or in the browser
const TZ = "Asia/Karachi"
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })

export function formatDate(date) {
  return date ? dateFormat.format(new Date(date)) : ""
}

// "10 yrs 3 mos" since the given date
export function tenure(since) {
  const start = new Date(since)
  const now = new Date()
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  if (now.getDate() < start.getDate()) months -= 1
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = []
  if (years) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`)
  if (rest || !years) parts.push(`${rest} ${rest === 1 ? "mo" : "mos"}`)
  return parts.join(" ")
}

// Whole days from today to the date (negative = past)
export function daysFromToday(date) {
  const d = new Date(date)
  const today = new Date()
  d.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86_400_000)
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDateTime(date) {
  return date ? dateTimeFormat.format(new Date(date)) : ""
}

// Full currency amount, e.g. Rs 24,500,000; paisa always with two digits (Rs 201,828.40)
export function formatAmount(amount, currency = "PKR") {
  const symbol = currency === "PKR" ? "Rs " : `${currency} `
  const n = Number(amount) || 0
  const digits = Number.isInteger(n) ? 0 : 2
  return symbol + new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n)
}

// 412 KB, 1.9 MB
export const formatSize = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`)

// "Overdue 3 days", "Today", "Tomorrow", "In 5 days" from a whole-day offset
export function dueLabel(days) {
  if (days < -1) return `Overdue ${-days} days`
  if (days === -1) return "Overdue 1 day"
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return `In ${days} days`
}

// Pakistani short form: Rs 1.25 Cr, Rs 45 Lac, Rs 85,000
export function formatPkr(amount) {
  const abs = Math.abs(amount)
  const trim = (n) => n.toFixed(2).replace(/\.?0+$/, "")
  if (abs >= 10_000_000) return `Rs ${trim(amount / 10_000_000)} Cr`
  if (abs >= 100_000) return `Rs ${trim(amount / 100_000)} Lac`
  return `Rs ${new Intl.NumberFormat("en-PK").format(amount)}`
}

// Rupees in words, Pakistani style: 2,415,000 → "Twenty Four Lakh Fifteen Thousand Rupees Only"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
const under100 = (n) => (n < 20 ? ONES[n] : [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" "))
function spell(n) {
  const parts = []
  const crore = Math.floor(n / 10_000_000)
  if (crore) parts.push(`${spell(crore)} Crore`)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  if (lakh) parts.push(`${under100(lakh)} Lakh`)
  const thousand = Math.floor((n % 100_000) / 1000)
  if (thousand) parts.push(`${under100(thousand)} Thousand`)
  const hundred = Math.floor((n % 1000) / 100)
  if (hundred) parts.push(`${ONES[hundred]} Hundred`)
  if (n % 100) parts.push(under100(n % 100))
  return parts.join(" ")
}
export const amountInWords = (amount) => {
  const n = Math.round(Math.abs(amount))
  return n ? `${spell(n)} Rupees Only` : "Zero Rupees"
}
