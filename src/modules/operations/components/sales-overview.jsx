"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatPkr, timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { toHex } from "@/lib/color"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { PaidMeter, StatusBadge, useUnitText } from "./sales-parts"

// Sales Overview: tiles, collections and bookings over six months, the pipeline by stage,
// who's most overdue and the latest bookings. data: salesOverview()

const href = (code) => `/operations/bookings/${urlCode(code)}`

// Six columns, one series, the latest highlighted; value on hover
function Columns({ data, valueKey, format }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]))
  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex h-36 items-end gap-3 border-b">
        {data.map((d, i) => (
          <Tooltip key={d.key} content={`${d.label}: ${format(d[valueKey])}`}>
            <div className="group flex h-full flex-1 cursor-default flex-col justify-end">
              {i === data.length - 1 && <span className="mb-1 text-center text-[11px] font-semibold tabular-nums">{format(d[valueKey])}</span>}
              <div className={cn("min-h-[2px] rounded-t-[4px] transition-colors", i === data.length - 1 ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70")} style={{ height: `${(d[valueKey] / max) * 100}%` }} />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[11px] text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SalesOverview({ data }) {
  const t = data.tiles
  const stages = useList("booking-stage")
  const unitText = useUnitText()
  const maxStage = Math.max(1, ...data.stages.map((s) => s.count))
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Operations" description="Bookings, collections and overdue installments" />
      {data.total === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-background px-4 py-16 text-center">
          <Icon name="hand-coin-line" className="text-4xl text-muted-foreground" />
          <p className="mt-3 font-medium">No bookings yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Bookings arrive from CRM when a lead is closed as won with a unit. Set up their payment plan, take payments and issue allotment letters here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon="hand-coin-line" label="Booked in 30 days" value={t.booked30} hint={`${formatPkr(t.bookedValue30)} sales value`} />
            <StatTile
              icon="wallet-3-line"
              tone="green"
              label="Collected in 30 days"
              value={formatPkr(t.collected30)}
              hint={t.collectedTrend == null ? "First month of receipts" : `${t.collectedTrend >= 0 ? "▲" : "▼"} ${Math.abs(t.collectedTrend)}% on the 30 days before`}
            />
            <StatTile icon="alarm-warning-line" tone="red" label="Overdue" value={formatPkr(t.overdueAmount)} hint={`${t.overdueBuyers} buyers · ${t.defaulters} defaulters`} />
            <StatTile icon="time-line" tone="amber" label="Cheques in clearing" value={formatPkr(t.clearing)} hint={`${t.clearingCount} waiting to clear`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Collections"
              className="lg:col-span-2"
              bodyClassName="p-0"
              action={
                <Link href="/operations/receipts" className="text-sm font-medium text-primary hover:underline">
                  Receipts
                </Link>
              }
            >
              <Columns data={data.months} valueKey="collected" format={formatPkr} />
              <div className="border-t px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-semibold">{data.receivedPct}%</span> <span className="text-muted-foreground">of booked value received</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">{formatPkr(t.receivable)} still to come</span>
                </div>
                <PaidMeter pct={data.receivedPct} className="mt-2" />
              </div>
            </SectionCard>
            <SectionCard title="Pipeline" bodyClassName="p-4">
              <ul className="space-y-3">
                {data.stages.map((s) => (
                  <li key={s.stage}>
                    <Link href={`/operations/bookings?stage=${s.stage}`} className="group block">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="group-hover:text-primary">{stages.label(s.stage)}</span>
                        <span className="font-semibold tabular-nums">{s.count}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-foreground/6">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / maxStage) * 100)}%`, backgroundColor: toHex(stages.map[s.stage]?.color) ?? "#64748b" }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Most overdue"
              bodyClassName="p-0"
              action={
                <Link href="/operations/installments" className="text-sm font-medium text-primary hover:underline">
                  All
                </Link>
              }
            >
              {data.mostOverdue.length ? (
                <ul className="divide-y">
                  {data.mostOverdue.map((b) => (
                    <li key={b.code}>
                      <Link href={href(b.code)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{b.buyer.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {b.project.name} · {b.unit.number}
                          </span>
                        </span>
                        <span className="text-right text-sm text-red-600 tabular-nums dark:text-red-400">
                          {formatPkr(b.overdueAmount)}
                          <span className="block text-xs text-muted-foreground">{b.overdueCount} missed</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Icon name="checkbox-circle-line" className="text-emerald-500" /> Nobody is overdue
                </p>
              )}
            </SectionCard>
            <SectionCard title="Bookings per month" bodyClassName="p-0">
              <Columns data={data.months} valueKey="booked" format={(n) => `${n} ${n === 1 ? "booking" : "bookings"}`} />
            </SectionCard>
            <SectionCard
              title="Latest bookings"
              bodyClassName="p-0"
              action={
                <Link href="/operations/bookings" className="text-sm font-medium text-primary hover:underline">
                  All
                </Link>
              }
            >
              <ul className="divide-y">
                {data.recent.map((b) => (
                  <li key={b.code}>
                    <Link href={href(b.code)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.buyer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {b.unit.number} · {unitText(b.unit)} · {timeAgo(b.bookedAt)}
                        </span>
                      </span>
                      <StatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
