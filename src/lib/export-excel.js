import { isNumeric, reportFileName } from "./reports"

// A report as an Excel file (.xlsx), built in the browser. The library loads on demand.
// report: { title, columns, }, result: { rows, summary }, meta: lines under the title
export async function downloadExcel(report, result, meta = []) {
  const { default: writeExcelFile } = await import("write-excel-file/browser")
  const bold = (value) => ({ value, fontWeight: "bold" })
  const cell = (col, row) => {
    const v = row[col.key]
    if (v === null || v === undefined || v === "") return null
    if (col.type === "pct") return { value: Number(v) / 100, type: Number, format: "0%" }
    if (isNumeric(col)) return { value: Number(v), type: Number, format: col.type === "pkr" ? "#,##0" : "#,##0" }
    return { value: String(v), type: String }
  }
  const sheet = [
    [bold(report.title)],
    ...meta.map((line) => [{ value: line }]),
    ...(result.summary?.length ? [[], ...result.summary.map((s) => [{ value: s.label }, bold(String(s.value))])] : []),
    [],
    report.columns.map((c) => ({ ...bold(c.header), align: isNumeric(c) ? "right" : undefined })),
    ...result.rows.map((r) => report.columns.map((c) => cell(c, r))),
  ]
  await writeExcelFile(sheet, {
    columns: report.columns.map((c) => ({ width: c.width ?? 14 })),
    fileName: `${reportFileName(report.title)}.xlsx`,
    sheet: report.title.slice(0, 30),
  })
}
