// Estate Management (Care) rules shared by the server and the browser: request types and their
// checklists, NDC purposes, record-update fields, default fees and timelines, and how a fee and a
// due date are worked out.

export const TYPES = ["transfer", "ndc", "possession", "document", "record-update", "complaint"]
// Types with their own list page (the rest live on the Service desk)
export const TYPE_PAGES = { transfer: "/estate-management/transfers", ndc: "/estate-management/ndc", possession: "/estate-management/possession", complaint: "/estate-management/complaints" }
export const OPEN_STATUSES = ["new", "in-progress", "awaiting-customer"]
export const CLOSED_STATUSES = ["completed", "rejected"]

// Checklists. auto: worked out from live data (can't be ticked); the rest are ticked by staff.
export const CHECKLISTS = {
  transfer: [
    { key: "application", label: "Transfer application signed by both parties" },
    { key: "documents", label: "CNICs, photos and the original allotment letter" },
    { key: "ndc", label: "Valid NDC on the file", auto: true },
    { key: "fee", label: "Transfer fee", auto: true },
    { key: "biometric", label: "Biometric verification of both parties" },
  ],
  ndc: [
    { key: "application", label: "NDC application" },
    { key: "dues", label: "No overdue dues", auto: true },
    { key: "fee", label: "NDC fee", auto: true },
  ],
  possession: [
    { key: "paid", label: "Paid in full", auto: true },
    { key: "phase", label: "Phase open for possession", auto: true },
    { key: "fee", label: "Possession charges", auto: true },
    { key: "demarcation", label: "Plot demarcated on site" },
  ],
  document: [
    { key: "application", label: "Request application" },
    { key: "supporting", label: "Supporting papers" },
    { key: "fee", label: "Document fee", auto: true },
  ],
  "record-update": [
    { key: "application", label: "Request application" },
    { key: "supporting", label: "Supporting papers (CNIC, affidavit…)" },
    { key: "verified", label: "Verified by the office" },
  ],
  complaint: [],
}

// Papers needed for each document on request
export const DOCUMENT_PAPERS = {
  "duplicate-allotment": "Affidavit on stamp paper, police report (FIR) of the lost letter, newspaper advertisement",
  statement: "Request from the buyer",
  "site-plan": "Request from the buyer",
  "noc-mortgage": "Bank's letter naming the buyer and the file",
}

export const NDC_PURPOSES = [
  { value: "transfer", label: "Transfer to a new owner" },
  { value: "mortgage", label: "Bank mortgage" },
  { value: "sale", label: "Sale (open market)" },
  { value: "record", label: "Owner's record" },
]
export const UPDATE_FIELDS = [
  { value: "nominee", label: "Nominee" },
  { value: "address", label: "Mailing address" },
  { value: "phone", label: "Mobile number" },
  { value: "name", label: "Name correction" },
]

// Fees (Rs) and timelines per type; a workspace changes them in Customize › Fees & timelines
export const DEFAULT_SETTINGS = {
  transfer: { perMarla: 2000, minimum: 25000, flat: 50000, days: 15 }, // per marla for plots/houses/files; flat for apartments, shops, offices
  ndc: { fee: 5000, days: 3, validDays: 30 },
  possession: { fee: 15000, days: 30 },
  document: { fees: { "duplicate-allotment": 10000, statement: 0, "site-plan": 2000, "noc-mortgage": 5000 }, days: 7 },
  "record-update": { fee: 3000, days: 5 },
  complaint: { hours: { urgent: 24, high: 48, normal: 72, low: 168 } },
}

export function mergeSettings(saved = {}) {
  const out = structuredClone(DEFAULT_SETTINGS)
  for (const [type, value] of Object.entries(saved ?? {}))
    if (out[type] && value && typeof value === "object")
      out[type] = { ...out[type], ...value, ...(value.fees ? { fees: { ...out[type].fees, ...value.fees } } : {}), ...(value.hours ? { hours: { ...out[type].hours, ...value.hours } } : {}) }
  return out
}

const FLAT_TYPES = ["apartment", "flat", "shop", "office", "penthouse"]

// The fee for a request when it's made (kept on the request, so later changes don't move it)
//   unit: { type, sizeValue, sizeUnit } · documentKind for documents
export function feeFor(settings, type, { unit = null, documentKind = null } = {}) {
  const s = settings[type]
  if (!s) return 0
  if (type === "transfer") {
    if (!unit) return s.minimum
    if (FLAT_TYPES.includes(String(unit.type ?? "").toLowerCase())) return s.flat
    const marla = unit.sizeUnit === "kanal" ? Number(unit.sizeValue) * 20 : unit.sizeUnit === "marla" ? Number(unit.sizeValue) : null
    return marla ? Math.max(s.minimum, Math.round(marla * s.perMarla)) : s.minimum
  }
  if (type === "document") return Number(s.fees?.[documentKind] ?? 0)
  return Number(s.fee ?? 0)
}

// When a request is due: its type's days, or a complaint's hours for its priority
export function dueFrom(settings, type, priority, from = new Date()) {
  const start = new Date(from).getTime()
  if (type === "complaint") return new Date(start + (settings.complaint.hours[priority] ?? 72) * 3_600_000)
  return new Date(start + (settings[type]?.days ?? 7) * 86_400_000)
}

// "Due in 2 days", "3 days late", "Due today"
export function dueLabel(dueAt, closed = false, now = Date.now()) {
  if (!dueAt || closed) return null
  const diff = new Date(dueAt).getTime() - now
  const hours = Math.round(Math.abs(diff) / 3_600_000)
  const days = Math.round(Math.abs(diff) / 86_400_000)
  const span = hours < 24 ? `${Math.max(1, hours)} ${hours === 1 ? "hour" : "hours"}` : `${days} ${days === 1 ? "day" : "days"}`
  return diff < 0 ? `${span} late` : `Due in ${span}`
}
