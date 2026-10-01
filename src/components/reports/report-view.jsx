"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { downloadExcel } from "@/lib/export-excel"
import { filterQuery, formatCell, isNumeric } from "@/lib/reports"
import { DataTable } from "@/components/data-table"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { ReportChart } from "./report-chart"
import { ReportDocument } from "./report-document"

// One report: filters (kept in the URL), summary tiles, chart, sortable table, and Print / Export
// through the print preview (PDF, Excel, print).
//   report: { id, title, description, icon, filters }; result: runReport(); filters: { key: { label, all, options } }
//   basePath: "/estate/reports"; pdfBase: "/api/estate/reports"
export function ReportView({ report, result, filters, basePath, pdfBase, brand, userName }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState(false)
  const query = filterQuery(result.values)
  const setFilter = (key, value) => startTransition(() => router.replace(`${pathname}${filterQuery({ ...result.values, [key]: value }) ? `?${filterQuery({ ...result.values, [key]: value })}` : ""}`, { scroll: false }))
  const columns = result.columns.map((c) => ({
    key: c.key,
    header: c.header,
    align: isNumeric(c) ? "right" : undefined,
    className: isNumeric(c) ? "whitespace-nowrap tabular-nums" : undefined,
    sortValue: (r) => r[c.key] ?? -Infinity,
    cell: (r) => formatCell(c, r),
  }))
  const meta = [brand.name, result.scope, `Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${userName ? ` by ${userName}` : ""}`].filter(Boolean)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Reports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">
              <Icon name={report.icon} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{report.title}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report.filters
              .filter((k) => filters[k])
              .map((k) => (
                <Select key={k} aria-label={filters[k].label} triggerClassName="w-56" value={result.values[k] ?? ""} onChange={(v) => setFilter(k, v)} options={[{ value: "", label: filters[k].all }, ...filters[k].options]} />
              ))}
            <Button leftIcon="printer-line" disabled={pending} onClick={() => setPreview(true)}>
              Print / export
            </Button>
          </div>
        </div>
      </div>

      <div className={pending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"} aria-busy={pending}>
        <div className="space-y-6">
          {result.summary?.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {result.summary.map((s) => (
                <div key={s.label} className="rounded-xl border bg-background p-4 shadow-xs">
                  <dt className="text-xs text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.chart?.data?.length > 0 && (
            <SectionCard title={result.chart.title ?? result.chart.valueLabel}>
              <ReportChart chart={result.chart} />
            </SectionCard>
          )}
          {result.note && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Icon name="information-line" className="mt-0.5" /> {result.note}
            </p>
          )}
          <DataTable columns={columns} rows={result.rows} rowKey={(r) => r.id} minWidth={`${Math.max(40, columns.length * 8)}rem`} empty={<p className="text-sm text-muted-foreground">No data for this selection.</p>} />
        </div>
      </div>

      {preview && (
        <PrintPreviewDialog
          title={report.title}
          description={`${result.rows.length} ${result.rows.length === 1 ? "row" : "rows"} · print preview (A4)`}
          printUrl={`${basePath}/${report.id}/print${query ? `?${query}` : ""}`}
          pdfUrl={`${pdfBase}/${report.id}/pdf${query ? `?${query}` : ""}`}
          onExcel={() => downloadExcel({ title: report.title, columns: result.columns }, result, meta)}
          onClose={() => setPreview(false)}
        >
          <ReportDocument report={report} result={result} brand={brand} generatedBy={userName} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}
