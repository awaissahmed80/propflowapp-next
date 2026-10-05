"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { dueLabel, daysFromToday, formatDate, formatDateTime, formatPkr } from "@/lib/format"
import { Delta } from "@/components/stat-tile"
import { BarChart, LineChart } from "@/components/ui/chart"
import { Icon } from "@/components/ui/icon"

// How each kind of card draws what the server worked out (server/cards.js lists the views).

const count = (v) => new Intl.NumberFormat("en-PK").format(v)
export const FORMATS = {
  pkr: (v) => formatPkr(Math.round(Number(v) || 0)),
  count,
  pct: (v) => `${Math.round(Number(v) * 10) / 10}%`,
  hours: (v) => (v < 1 ? `${Math.round(v * 60)} min` : v < 48 ? `${Math.round(v * 10) / 10} hrs` : `${Math.round((v / 24) * 10) / 10} days`),
}
export const show = (format, v) => (v == null || Number.isNaN(v) ? "—" : (FORMATS[format] ?? String)(v))
// Short axis labels: 2.5Cr, 40L
const trim = (n) => String(Math.round(n * 10) / 10)
const axisPkr = (v) => (Math.abs(v) >= 1e7 ? `${trim(v / 1e7)}Cr` : Math.abs(v) >= 1e5 ? `${trim(v / 1e5)}L` : count(v))
const axisOf = (format) => (format === "pkr" ? axisPkr : format === "pct" ? (v) => `${v}%` : (v) => count(v))

const TONES = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
}

function Empty({ text }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
      <Icon name="inbox-2-line" className="text-xl" />
      {text ?? "Nothing to show for this period."}
    </div>
  )
}

function Note({ text }) {
  return text ? <p className="mt-2 text-xs text-muted-foreground">{text}</p> : null
}

// A headline number with its change against the previous period
export function KpiView({ view, compares, tv }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn("hidden size-10 shrink-0 items-center justify-center rounded-lg text-lg @min-[15rem]/card:flex", TONES[view.tone] ?? TONES.primary, tv && "size-12 text-2xl")}>
        <Icon name={view.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-2xl leading-tight font-semibold whitespace-nowrap tabular-nums", tv && "text-4xl")}>{show(view.format, view.value)}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {compares && <Delta value={view.value} previous={view.previous} kind={view.delta} good={view.good} format={(v) => show(view.format, v)} className={tv ? "text-sm" : undefined} />}
          {view.hint && <span className={cn("min-w-0 truncate text-xs text-muted-foreground", tv && "text-sm")}>{view.hint}</span>}
        </div>
      </div>
    </div>
  )
}

// Horizontal bars drawn in HTML, each labelled with its value (comparison across categories)
function HBarsView({ view, tv }) {
  const rows = view.rows ?? []
  if (!rows.length || rows.every((r) => !r.value)) return <Empty text={view.empty} />
  const max = view.max ?? Math.max(...rows.map((r) => r.value), 1)
  return (
    <>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${show(view.format, r.value)}${r.note ? ` (${r.note})` : ""}`}>
            <div className={cn("flex items-baseline justify-between gap-3 text-sm", tv && "text-base")}>
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {show(view.format, r.value)}
                {r.note && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.note}</span>}
              </span>
            </div>
            <div className={cn("mt-1 h-2 overflow-hidden rounded-full bg-muted", tv && "h-3")} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%`, background: r.color }} />
            </div>
          </li>
        ))}
      </ul>
      <Note text={view.note} />
    </>
  )
}

function BarsView({ view, tv }) {
  const data = view.data ?? []
  if (!data.length || data.every((d) => view.series.every((s) => !d[s.key]))) return <Empty text={view.empty} />
  const height = view.horizontal ? Math.max(tv ? 200 : 160, data.length * (tv ? 48 : 38) + 70) : tv ? 320 : 250
  return (
    <>
      <BarChart
        data={data}
        xKey={view.xKey}
        series={view.series}
        stacked={view.stacked}
        horizontal={view.horizontal}
        valueFormatter={(v) => show(view.format, v)}
        axisFormatter={axisOf(view.format)}
        categoryWidth={120}
        style={{ height }}
      />
      <Note text={view.note} />
    </>
  )
}

function LineView({ view, tv }) {
  const data = view.data ?? []
  if (!data.length || data.every((d) => view.series.every((s) => !d[s.key]))) return <Empty text={view.empty} />
  return (
    <>
      <LineChart data={data} xKey={view.xKey} series={view.series} valueFormatter={(v) => show(view.format, v)} axisFormatter={axisOf(view.format)} wholeNumbers={view.wholeNumbers} className={tv ? "h-80" : "h-64"} />
      <Note text={view.note} />
    </>
  )
}

// A list value can be text, or a date the browser words: { due } "Overdue 3 days", { until } "Until 6 Oct",
// { at } hold end "5 hrs left"
function listValue(v) {
  if (v == null || typeof v !== "object") return v
  if (v.due) return dueLabel(daysFromToday(v.due))
  if (v.until) return `Until ${formatDate(v.until)}`
  if (v.at) {
    const hours = (new Date(v.at) - Date.now()) / 3_600_000
    return hours <= 0 ? "Ending" : hours < 24 ? `${Math.max(1, Math.round(hours))} hrs left` : formatDateTime(v.at)
  }
  return ""
}

function ListView({ view, tv }) {
  if (!view.rows?.length) return <Empty text={view.empty} />
  return (
    <ul className="-mx-2 divide-y">
      {view.rows.map((r, i) => {
        const body = (
          <>
            {r.icon && (
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[r.tone] ?? "bg-muted text-muted-foreground")}>
                <Icon name={r.icon} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm", tv && "text-base")}>{r.title}</span>
              {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
            </span>
            <span className={cn("shrink-0 text-sm font-medium tabular-nums", r.tone === "red" && "text-red-600 dark:text-red-400")}>{listValue(r.value)}</span>
          </>
        )
        return (
          <li key={i}>
            {r.href ? (
              <Link href={r.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-2 py-2">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TableView({ view, tv }) {
  if (!view.rows?.length) return <Empty text={view.empty} />
  return (
    <>
      <div className="-mx-4 overflow-x-auto">
        <table className={cn("w-full text-sm", tv && "text-base")}>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {view.columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-2 font-medium whitespace-nowrap", c.align === "right" ? "text-right" : "text-left")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.rows.map((r) => (
              <tr key={r.id} className={cn(r.strong && "font-semibold")}>
                {view.columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-2", c.align === "right" ? "text-right whitespace-nowrap tabular-nums" : "max-w-56 truncate")}>
                    {c.format ? show(c.format, r[c.key]) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note text={view.note} />
    </>
  )
}

export function CardBody({ view, compares, tv }) {
  if (view.type === "kpi") return <KpiView view={view} compares={compares} tv={tv} />
  if (view.type === "hbars") return <HBarsView view={view} tv={tv} />
  if (view.type === "bars") return <BarsView view={view} tv={tv} />
  if (view.type === "line") return <LineView view={view} tv={tv} />
  if (view.type === "list") return <ListView view={view} tv={tv} />
  if (view.type === "table") return <TableView view={view} tv={tv} />
  return null
}
