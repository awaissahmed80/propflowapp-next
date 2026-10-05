// Saving tables in the browser: Excel (.xlsx) or CSV (with a BOM so Excel reads Urdu correctly)

export async function downloadXlsx(table, fileName, { boldFirstRow = true } = {}) {
  const { default: writeExcelFile } = await import("write-excel-file/browser")
  const [head, ...body] = table
  const data = [boldFirstRow ? head.map((v) => ({ value: String(v ?? ""), fontWeight: "bold" })) : head.map((v) => cell(v)), ...body.map((r) => r.map(cell))]
  await writeExcelFile(data, { columns: head.map((h) => ({ width: Math.min(60, Math.max(12, String(h ?? "").length + 4)) })) }).toFile(fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`)
}

const cell = (v) => (typeof v === "number" ? { value: v, type: Number } : { value: v == null ? "" : String(v), type: String })

export function downloadCsv(table, fileName) {
  const esc = (v) => {
    const s = v == null ? "" : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = "﻿" + table.map((r) => r.map(esc).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName.endsWith(".csv") ? fileName : `${fileName}.csv` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// "Leads 2026-10-05"
export const datedName = (label) => `${label} ${new Date().toISOString().slice(0, 10)}`
