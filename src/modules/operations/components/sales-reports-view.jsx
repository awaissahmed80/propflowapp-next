"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { urlCode } from "@/lib/url"
import { formatDate, formatPkr } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { BarChart } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { ReceiptBadge, StageBadge, StatusBadge } from "./sales-parts"

// Sales › Reports: pick a report on the left; project and period filters, a few totals, a chart
// where it helps, the table, and Export (CSV, opens in Excel). Filters live in the address, so a
// report can be bookmarked or shared.
//   reports: REPORTS · report: the open one · data: salesReport() · filters: { project, from, to, preset }

const pad = (n) => String(n).padStart(2, "0")
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Period presets; Pakistan's tax year runs 1 July – 30 June
function presetRange(key) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (key === "this-month") return [ymd(new Date(y, m, 1)), ymd(now)]
  if (key === "last-month") return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))]
  if (key === "this-quarter") return [ymd(new Date(y, m - (m % 3), 1)), ymd(now)]
  if (key === "tax-year") return [ymd(new Date(m >= 6 ? y : y - 1, 6, 1)), ymd(now)]
  if (key === "last-tax-year") return [ymd(new Date(m >= 6 ? y - 1 : y - 2, 6, 1)), ymd(new Date(m >= 6 ? y : y - 1, 5, 30))]
  if (key === "12-months") return [ymd(new Date(y, m - 11, 1)), ymd(now)]
  return [null, null]
}
const PRESETS = [
  { value: "all", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "tax-year", label: "This tax year (from 1 July)" },
  { value: "last-tax-year", label: "Last tax year" },
  { value: "12-months", label: "Last 12 months" },
  { value: "custom", label: "Custom dates" },
]

const money = (k, header, extra = {}) => ({
  key: k,
  header,
  className: "text-right tabular-nums whitespace-nowrap",
  sortValue: (r) => r[k],
  cell: (r) => (r[k] ? formatPkr(r[k]) : <span className="text-muted-foreground">—</span>),
  csv: (r) => r[k] ?? 0,
  ...extra,
})
const text = (k, header, extra = {}) => ({ key: k, header, sortValue: (r) => r[k] ?? "", cell: (r) => r[k] ?? <span className="text-muted-foreground">—</span>, csv: (r) => r[k] ?? "", ...extra })
const date = (k, header) => ({
  key: k,
  header,
  className: "whitespace-nowrap text-muted-foreground",
  sortValue: (r) => (r[k] ? new Date(r[k]).getTime() : 0),
  cell: (r) => (r[k] ? formatDate(r[k]) : "—"),
  csv: (r) => (r[k] ? formatDate(r[k]) : ""),
})
const booking = (k = "code") => ({
  key: "booking",
  header: "Booking",
  sortValue: (r) => r.buyer?.toLowerCase() ?? "",
  cell: (r) => (
    <div className="min-w-0">
      <Link href={`/operations/bookings/${urlCode(r[k])}`} className="block truncate font-medium hover:text-primary">
        {r.buyer}
      </Link>
      <span className="block truncate text-xs text-muted-foreground tabular-nums">{[r[k], r.project, r.unit].filter(Boolean).join(" · ")}</span>
    </div>
  ),
  csv: (r) => `${r.buyer} (${r[k]})`,
})
const phone = {
  key: "phone",
  header: "Mobile",
  className: "whitespace-nowrap tabular-nums",
  cell: (r) => (r.phone ? <a href={`tel:${r.phone}`}>{formatPkPhone(r.phone)}</a> : "—"),
  csv: (r) => (r.phone ? formatPkPhone(r.phone) : ""),
}

function Figure({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold whitespace-nowrap tabular-nums", tone)}>{value}</div>
    </div>
  )
}

export function SalesReportsView({ reports, report, data, projects, filters }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const stages = useList("booking-stage")
  const statuses = useList("booking-status")
  const methods = useList("payment-method")
  const preset = filters.preset ?? (filters.from || filters.to ? "custom" : "all")

  const go = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    router.replace(`${pathname}?${next}`, { scroll: false })
  }
  const setPreset = (v) => {
    if (v === "custom") return go({ period: "custom" })
    const [from, to] = presetRange(v)
    go({ period: v === "all" ? null : v, from, to })
  }

  const t = data.totals
  const methodCell = { key: "method", header: "Method", sortValue: (r) => r.method, cell: (r) => methods.label(r.method), csv: (r) => methods.label(r.method) }
  const DEF = {
    "sales-register": {
      figures: [
        ["Bookings", t.count ?? 0],
        ["Sales value", formatPkr(t.net ?? 0)],
        ["Received", formatPkr(t.received ?? 0), "text-emerald-700 dark:text-emerald-400"],
        ["Outstanding", formatPkr(t.balance ?? 0)],
      ],
      columns: [
        date("date", "Booked"),
        booking(),
        phone,
        money("net", "Net price"),
        money("received", "Received"),
        money("balance", "Balance"),
        text("soldBy", "Sold by"),
        text("dealer", "Dealer", { cell: (r) => r.dealer ?? <span className="text-muted-foreground">Direct</span>, csv: (r) => r.dealer ?? "Direct" }),
        { key: "stage", header: "Stage", sortValue: (r) => r.stage, cell: (r) => <StageBadge stage={r.stage} />, csv: (r) => stages.label(r.stage) },
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} />, csv: (r) => statuses.label(r.status) },
      ],
      sort: { key: "date", dir: "desc" },
    },
    collections: {
      figures: [
        ["Received", formatPkr(t.amount ?? 0), "text-emerald-700 dark:text-emerald-400"],
        ["Cleared", formatPkr(t.cleared ?? 0)],
        ["In clearing", formatPkr(t.clearing ?? 0), "text-amber-700 dark:text-amber-400"],
        ["Bounced", formatPkr(t.bounced ?? 0), t.bounced ? "text-red-600 dark:text-red-400" : undefined],
      ],
      chart: { xKey: "method", series: [{ key: "amount", label: "Received" }], horizontal: true, map: (c) => ({ ...c, method: methods.label(c.method) }) },
      columns: [
        date("date", "Date"),
        text("code", "Receipt", { className: "whitespace-nowrap tabular-nums" }),
        booking("booking"),
        methodCell,
        text("reference", "Reference"),
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <ReceiptBadge status={r.status} />, csv: (r) => r.status },
        money("amount", "Amount", { className: "text-right font-medium tabular-nums whitespace-nowrap" }),
        text("by", "Recorded by"),
      ],
      sort: { key: "date", dir: "desc" },
    },
    aging: {
      figures: [
        ["Receivable", formatPkr(t.total ?? 0)],
        ["Overdue", formatPkr(t.overdue ?? 0), t.overdue ? "text-red-600 dark:text-red-400" : undefined],
        ["Over 90 days", formatPkr(t.d90plus ?? 0), t.d90plus ? "text-red-600 dark:text-red-400" : undefined],
        ["Buyers", t.count ?? 0],
      ],
      chart: { xKey: "bucket", series: [{ key: "amount", label: "Amount" }] },
      columns: [
        booking(),
        phone,
        ...(t.unscheduled ? [money("unscheduled", "No plan yet")] : []),
        money("notDue", "Not yet due"),
        money("d30", "1–30 days"),
        money("d60", "31–60 days"),
        money("d90", "61–90 days"),
        money("d90plus", "Over 90 days"),
        money("total", "Total due", { className: "text-right font-medium tabular-nums whitespace-nowrap" }),
      ],
      sort: { key: "d90plus", dir: "desc" },
    },
    defaulters: {
      figures: [
        ["Buyers overdue", t.count ?? 0],
        ["Defaulters", t.defaulters ?? 0, t.defaulters ? "text-red-600 dark:text-red-400" : undefined],
        ["Overdue amount", formatPkr(t.overdue ?? 0), t.overdue ? "text-red-600 dark:text-red-400" : undefined],
      ],
      columns: [
        booking(),
        phone,
        text("handledBy", "Handled by"),
        { key: "count", header: "Missed", className: "text-right tabular-nums", sortValue: (r) => r.count, cell: (r) => r.count, csv: (r) => r.count },
        money("overdue", "Overdue", { className: "text-right font-medium tabular-nums whitespace-nowrap text-red-600 dark:text-red-400" }),
        { key: "daysLate", header: "Days late", className: "text-right tabular-nums", sortValue: (r) => r.daysLate, cell: (r) => r.daysLate, csv: (r) => r.daysLate },
        date("lastPaid", "Last paid"),
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} />, csv: (r) => statuses.label(r.status) },
      ],
      sort: { key: "daysLate", dir: "desc" },
    },
    "by-project": {
      figures: [
        ["Bookings", t.count ?? 0],
        ["Sales value", formatPkr(t.value ?? 0)],
        ["Received", formatPkr(t.received ?? 0), "text-emerald-700 dark:text-emerald-400"],
        ["Overdue", formatPkr(t.overdue ?? 0), t.overdue ? "text-red-600 dark:text-red-400" : undefined],
      ],
      chart: {
        xKey: "name",
        series: [
          { key: "value", label: "Sales value" },
          { key: "received", label: "Received" },
        ],
        horizontal: true,
      },
      columns: [
        text("name", "Project", { cell: (r) => <span className="font-medium">{r.name}</span> }),
        { key: "bookings", header: "Bookings", className: "text-right tabular-nums", sortValue: (r) => r.bookings, cell: (r) => r.bookings, csv: (r) => r.bookings },
        money("value", "Sales value"),
        money("avg", "Average"),
        money("received", "Received"),
        { key: "collectedPct", header: "Collected", className: "text-right tabular-nums", sortValue: (r) => r.collectedPct, cell: (r) => `${r.collectedPct}%`, csv: (r) => `${r.collectedPct}%` },
        money("balance", "Outstanding"),
        money("overdue", "Overdue"),
      ],
      sort: { key: "value", dir: "desc" },
    },
    cancellations: {
      figures: [
        ["Canceled", t.count ?? 0],
        ["Paid by buyers", formatPkr(t.paid ?? 0)],
        ["Kept (deductions)", formatPkr(t.deduction ?? 0)],
        ["Refunds still due", formatPkr(t.refundsDue ?? 0), t.refundsDue ? "text-amber-700 dark:text-amber-400" : undefined],
      ],
      columns: [
        date("date", "Canceled"),
        booking(),
        text("reason", "Reason", { cell: (r) => <span className="line-clamp-2 max-w-64 text-sm">{r.reason ?? "—"}</span> }),
        money("paid", "Paid"),
        { key: "deductionPct", header: "Deduction", className: "text-right tabular-nums", sortValue: (r) => r.deductionPct, cell: (r) => `${r.deductionPct}%`, csv: (r) => `${r.deductionPct}%` },
        money("refund", "Refund"),
        { key: "status", header: "Refund", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} />, csv: (r) => statuses.label(r.status) },
        text("by", "By"),
      ],
      sort: { key: "date", dir: "desc" },
    },
    cheques: {
      figures: [
        ["Cheques", t.count ?? 0],
        ["In clearing", formatPkr(t.clearing ?? 0), "text-amber-700 dark:text-amber-400"],
        ["Cleared", formatPkr(t.cleared ?? 0), "text-emerald-700 dark:text-emerald-400"],
        ["Bounced", `${formatPkr(t.bounced ?? 0)}${t.bouncedCount ? ` · ${t.bouncedCount}` : ""}`, t.bounced ? "text-red-600 dark:text-red-400" : undefined],
      ],
      columns: [
        date("date", "Received"),
        text("chequeNo", "Cheque / PO no.", { className: "whitespace-nowrap tabular-nums" }),
        text("bank", "Bank"),
        booking("booking"),
        methodCell,
        { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <ReceiptBadge status={r.status} />, csv: (r) => r.status },
        money("amount", "Amount", { className: "text-right font-medium tabular-nums whitespace-nowrap" }),
      ],
      sort: { key: "date", dir: "desc" },
    },
  }
  DEF["by-partner"] = {
    ...DEF["by-project"],
    chart: { ...DEF["by-project"].chart },
    columns: [
      text("name", "Agent / dealer", {
        cell: (r) => (
          <span>
            <span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.type}</span>
          </span>
        ),
        csv: (r) => `${r.name} (${r.type})`,
      }),
      ...DEF["by-project"].columns.slice(1),
    ],
  }
  const def = DEF[report.key]

  const exportCsv = () => {
    const cols = def.columns.filter((c) => c.csv)
    const esc = (v) => {
      const s = String(v ?? "")
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [cols.map((c) => esc(c.header)).join(","), ...data.rows.map((r) => cols.map((c) => esc(c.csv(r))).join(","))]
    // BOM so Excel reads it as UTF-8
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${report.key}${filters.from ? `-${filters.from}` : ""}${filters.to ? `-to-${filters.to}` : ""}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:p-8">
      <nav aria-label="Reports" className="space-y-1 self-start lg:sticky lg:top-4">
        <h1 className="px-2 pb-2 text-xl font-semibold tracking-tight">Reports</h1>
        {reports.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => go({ r: r.key })}
            aria-current={r.key === report.key ? "page" : undefined}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
              r.key === report.key && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
            )}
          >
            <Icon name={r.icon} className="shrink-0 text-base" />
            <span className="min-w-0 truncate">{r.title}</span>
          </button>
        ))}
      </nav>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{report.title}</h2>
            <p className="text-sm text-muted-foreground">{report.text}</p>
          </div>
          <Button variant="outline" leftIcon="download-2-line" disabled={!data.rows.length} onClick={exportCsv}>
            Export
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Select
            aria-label="Project"
            triggerClassName="w-52"
            value={filters.project ?? "all"}
            onChange={(v) => go({ project: v === "all" ? null : v.toLowerCase() })}
            options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]}
          />
          {report.period && (
            <>
              <Select aria-label="Period" triggerClassName="w-56" value={preset} onChange={setPreset} options={PRESETS} />
              {preset === "custom" && (
                <>
                  <DatePicker aria-label="From" className="w-44" value={filters.from ?? ""} onChange={(v) => go({ from: v || null })} />
                  <DatePicker aria-label="To" className="w-44" value={filters.to ?? ""} onChange={(v) => go({ to: v || null })} />
                </>
              )}
            </>
          )}
          {!report.period && <span className="pb-2 text-sm text-muted-foreground">As of today</span>}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-background px-4 py-3 shadow-xs md:grid-cols-4">
          {def.figures.map(([label, value, tone]) => (
            <Figure key={label} label={label} value={value} tone={tone} />
          ))}
        </div>

        {def.chart && data.chart?.some((c) => def.chart.series.some((s) => c[s.key] > 0)) && (
          <div className="rounded-xl border bg-background p-4 shadow-xs">
            <BarChart
              data={def.chart.map ? data.chart.map(def.chart.map) : data.chart}
              xKey={def.chart.xKey}
              series={def.chart.series}
              horizontal={def.chart.horizontal}
              valueFormatter={(v) => formatPkr(v)}
              axisFormatter={(v) => (v >= 1e7 ? `${Math.round(v / 1e6) / 10} Cr` : v >= 1e5 ? `${Math.round(v / 1e4) / 10} Lac` : String(v))}
              categoryWidth={140}
              className={def.chart.horizontal ? "h-72" : "h-60"}
            />
          </div>
        )}

        <DataTable
          columns={def.columns}
          rows={data.rows}
          rowKey={(r, i) => r.code ?? r.key ?? i}
          minWidth="64rem"
          defaultSort={def.sort}
          empty={<p className="text-sm text-muted-foreground">Nothing in this report for these filters.</p>}
        />
      </section>
    </div>
  )
}
