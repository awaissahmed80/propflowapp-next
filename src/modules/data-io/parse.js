// Reading an import file in the browser: Excel (.xlsx) or CSV → { headers, rows } with every cell
// as text (dates as YYYY-MM-DD). Only the rows are sent to the server, never the file.

import { MAX_IMPORT_ROWS } from "./entities"

const cellText = (v) => {
  if (v == null) return ""
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)
  return String(v).trim()
}

// RFC 4180 CSV: quoted fields, "" inside quotes, commas / semicolons / tabs, CRLF
export function parseCsv(text) {
  const src = text.replace(/^﻿/, "")
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === "") quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// A File → { headers, rows, total } | { error }
export async function readImportFile(file) {
  const name = file.name.toLowerCase()
  let table
  try {
    if (name.endsWith(".xlsx")) {
      const { default: readXlsxFile } = await import("read-excel-file")
      table = await readXlsxFile(file)
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) table = parseCsv(await file.text())
    else return { error: "Use an Excel (.xlsx) or CSV file. In Excel: File › Save As › Excel Workbook or CSV." }
  } catch {
    return { error: "That file couldn't be read. Save it again as .xlsx or CSV and try once more." }
  }
  const all = table.map((r) => r.map(cellText))
  // The heading row: the first with at least two filled cells
  const start = all.findIndex((r) => r.filter(Boolean).length >= 2)
  if (start < 0) return { error: "The file is empty." }
  const headers = all[start].map((h, i) => h || `Column ${i + 1}`)
  const rows = all.slice(start + 1).filter((r) => r.some(Boolean))
  if (!rows.length) return { error: "The file has headings but no rows." }
  if (rows.length > MAX_IMPORT_ROWS) return { error: `That's ${rows.length.toLocaleString("en-US")} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time: split the file.` }
  return { headers, rows: rows.map((r) => headers.map((_, i) => r[i] ?? "")), total: rows.length }
}
