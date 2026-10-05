// Reading the values people type in spreadsheets: Pakistani mobiles, CNICs with or without dashes,
// dates in the usual formats, amounts in lakh / crore, list values by label or by code. Each returns
// { value } or { error }, or null for an empty cell.

import { normalizePhone } from "@/lib/phone"
import { CNIC_PATTERN, formatCnic } from "@/lib/cnic"

const empty = (v) => v == null || String(v).trim() === "" || ["-", "—", "n/a", "na", "nil", "none"].includes(String(v).trim().toLowerCase())

export const text = (v, max = 150) => (empty(v) ? null : { value: String(v).trim().replace(/\s+/g, " ").slice(0, max) })

export function phone(v) {
  if (empty(v)) return null
  // Excel turns 03001234567 into 3001234567; scientific notation for long numbers
  const s = /e\+/i.test(String(v)) ? Number(v).toFixed(0) : String(v)
  const digits = s.replace(/\D/g, "")
  // 3001234567 (Excel dropped the 0) · 971501234567 (an overseas number typed without +)
  const p = normalizePhone(s) ?? normalizePhone(`0${digits}`) ?? (digits.length >= 11 && !digits.startsWith("0") ? normalizePhone(`+${digits}`) : null)
  return p ? { value: p } : { error: `“${v}” isn't a mobile number` }
}

export function cnic(v) {
  if (empty(v)) return null
  const digits = String(v).replace(/\D/g, "")
  const formatted = digits.length === 13 ? formatCnic(digits) : String(v).trim()
  return CNIC_PATTERN.test(formatted) ? { value: formatted } : { error: `“${v}” isn't a CNIC (13 digits)` }
}

export function email(v) {
  if (empty(v)) return null
  const s = String(v).trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(s) ? { value: s.slice(0, 150) } : { error: `“${v}” isn't an email` }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const iso = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null
}
// 2026-09-15 · 15/09/2026 · 15-09-26 · 15 Sep 2026 · Sep 15, 2026 · Excel serial 46280
export function date(v) {
  if (empty(v)) return null
  const s = String(v).trim()
  let m
  let out = null
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) out = iso(+m[1], +m[2], +m[3])
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) out = iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  else if ((m = s.match(/^(\d{1,2})[\s-]([a-z]{3,})[\s-,]*(\d{2,4})$/i)))
    out = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0 ? iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]) : null
  else if ((m = s.match(/^([a-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/i))) out = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) >= 0 ? iso(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]) : null
  else if (/^\d{5}$/.test(s)) out = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000).toISOString().slice(0, 10)
  return out ? { value: out } : { error: `“${v}” isn't a date (use 2026-09-15 or 15/09/2026)` }
}

// "Rs 1,250,000" · "12.5 lakh" · "1.2 crore" · "1.5 cr" · "50 lac" · "2.5m"
export function money(v) {
  if (empty(v)) return null
  const s = String(v)
    .toLowerCase()
    .replace(/rs\.?|pkr|,|\s+/g, "")
  const m = s.match(/^(\d+(?:\.\d+)?)(crore|cr|lakh|lac|lacs|lakhs|l|m|k)?$/)
  if (!m) return { error: `“${v}” isn't an amount` }
  const mult = { crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, lacs: 1e5, lakhs: 1e5, l: 1e5, m: 1e6, k: 1e3 }[m[2]] ?? 1
  return { value: Math.round(Number(m[1]) * mult) }
}

export function int(v, min = -1e9, max = 1e9) {
  if (empty(v)) return null
  const n = Number(String(v).replace(/,/g, ""))
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { error: `“${v}” isn't a whole number` }
}

export function bool(v) {
  if (empty(v)) return null
  const s = String(v).trim().toLowerCase()
  if (["yes", "y", "true", "1", "haan", "ha"].includes(s)) return { value: true }
  if (["no", "n", "false", "0", "nahi"].includes(s)) return { value: false }
  return { error: `“${v}” isn't yes or no` }
}

// A pick-list value by its code or label (active ones), case and spacing ignored
export function lookup(list, v, what = "value") {
  if (empty(v)) return null
  const key = String(v).trim().toLowerCase().replace(/\s+/g, " ")
  const slug = key.replace(/[^a-z0-9]+/g, "-")
  const hit = list.find((x) => x.isActive !== false && (x.value === key || x.value === slug || String(x.label).toLowerCase() === key))
  return hit ? { value: hit.value } : { error: `“${v}” isn't a ${what} in your lists` }
}

export const isEmpty = empty

// Date and time in Pakistan time → a Date: "2026-09-20 15:30", "2026-09-20T15:30:00",
// "20/09/2026 3:30 PM"; a date alone is 9 am
export function datetime(v) {
  if (empty(v)) return null
  const s = String(v).trim()
  const m = s.match(/^(.+?)[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?$/i)
  const d = date(m ? m[1] : s)
  if (!d) return null
  if (d.error) return { error: `“${v}” isn't a date and time (use 2026-09-20 15:30)` }
  let h = m ? Number(m[2]) : 9
  const min = m ? Number(m[3]) : 0
  if (m?.[5]) h = (h % 12) + (m[5].toLowerCase() === "pm" ? 12 : 0)
  if (h > 23 || min > 59) return { error: `“${v}” isn't a time` }
  return { value: new Date(`${d.value}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${m?.[4] ?? "00"}+05:00`) }
}
