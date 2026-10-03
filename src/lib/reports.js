import { formatPkr } from "./format"

// Ready-made reports, shared by every app. A report is defined on the server (see e.g.
// modules/portfolio/server/reports.js) and arrives in the browser as plain data:
//   { id, group, title, description, icon, filters: ["project"],
//     columns: [{ key, header, type?: "number" | "pkr" | "pct", width? (chars) }] }
// and its result: { rows: [{ id, [key]: value }], summary: [{ label, value }], chart?, note? }
// chart: { kind: "bar", categoryKey, valueKey, valueLabel, money?, data }
//     or { kind: "stacked" | "bars" | "line", categoryKey, series: [{ key, label, color }], money?, data }
// The same data drives the table, the chart, the A4 print, the PDF and the Excel file.

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const full = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n)}`

// A cell for the screen ("Rs 4.9 Lac"); print: whole rupees ("Rs 4,900,000")
export function formatCell(col, row, { print = false } = {}) {
  const v = row[col.key]
  if (v === null || v === undefined || v === "") return "—"
  if (col.type === "pkr") return print ? full(v) : formatPkr(v)
  if (col.type === "pct") return `${v}%`
  if (col.type === "number") return number(v)
  return String(v)
}

export const isNumeric = (col) => ["number", "pkr", "pct"].includes(col.type)

// "Availability by block 2026-10-01"
export const reportFileName = (title) => `${title} ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, "-")

// The query string of a report's filters ({ project: "ske" } → "project=ske")
export const filterQuery = (values) => new URLSearchParams(Object.entries(values).filter(([, v]) => v)).toString()
