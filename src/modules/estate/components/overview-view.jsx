"use client"

import Link from "next/link"
import { useState } from "react"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { vizColor } from "@/lib/chart-colors"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { BarChart } from "@/components/ui/chart"
import { Icon } from "@/components/ui/icon"
import { NewRequestDialog } from "./new-request-dialog"
import { DueLabel, StatusBadge, TypeBadge } from "./service-parts"

// Estate Management › Overview: open and overdue requests, complaints and how fast they're
// fixed, transfers, who we're waiting on and what closed lately.
//   data: serviceOverview() · newRequest: newRequestProps()

const hoursText = (h) => (h == null ? "—" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)

function ViewAll({ href, children = "View all" }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

// One request: type, title, who and where, and something on the right (due, status, age)
function RequestRow({ r, meta }) {
  return (
    <li>
      <Link href={`/estate-management/requests/${urlCode(r.code)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
        <TypeBadge type={r.type} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.subject}</span>
          <span className="block truncate text-xs text-muted-foreground">{[r.code, r.contact, r.unit].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="shrink-0 text-right">{meta}</span>
      </Link>
    </li>
  )
}

const Empty = ({ children }) => <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>

export function ServicesOverview({ data: v, title, description, newRequest }) {
  const types = useList("service-request-type")
  const categories = useList("complaint-category")
  const [creating, setCreating] = useState(false)
  const byType = types.values.map((t) => ({ type: t.label, count: v.byType[t.value] ?? 0 })).filter((x) => x.count)
  const byCategory = Object.entries(v.byCategory)
    .map(([c, count]) => ({ category: categories.label(c), count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          newRequest?.canCreate && (
            <Button leftIcon="add-line" onClick={() => setCreating(true)}>
              New request
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="inbox-line" label="Open requests" value={v.open} hint={v.overdue ? `${v.overdue} overdue` : "None overdue"} tone={v.overdue ? "red" : "primary"} />
        <StatTile icon="error-warning-line" tone="amber" label="Open complaints" value={v.openComplaints} hint={`${v.urgentComplaints} urgent or high`} />
        <StatTile icon="arrow-left-right-line" tone="violet" label="Transfers in progress" value={v.transfersOpen} hint={`${v.transfersDone30} completed in 30 days`} />
        <StatTile icon="timer-line" tone="green" label="Complaint fix time" value={hoursText(v.fixHours)} hint={v.onTimePct == null ? "No complaints closed in 30 days" : `${v.onTimePct}% within the response time`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Overdue" action={<ViewAll href="/estate-management/requests?view=overdue" />} className="lg:col-span-2" bodyClassName="p-2">
          {v.overdueList.length ? (
            <ul>
              {v.overdueList.map((r) => (
                <RequestRow key={r.code} r={r} meta={<DueLabel request={r} />} />
              ))}
            </ul>
          ) : (
            <Empty>Nothing overdue.</Empty>
          )}
        </SectionCard>
        <SectionCard title="Open by type" action={<ViewAll href="/estate-management/requests" />}>
          {byType.length ? (
            <BarChart
              data={byType}
              xKey="type"
              horizontal
              categoryWidth={100}
              showLegend={false}
              series={[{ key: "count", label: "Open requests", color: vizColor("blue") }]}
              style={{ height: Math.max(160, byType.length * 32 + 40) }}
            />
          ) : (
            <Empty>Nothing open.</Empty>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Complaints, last 30 days" action={<ViewAll href="/estate-management/complaints">Complaints</ViewAll>}>
          {byCategory.length ? (
            <BarChart
              data={byCategory}
              xKey="category"
              horizontal
              categoryWidth={130}
              showLegend={false}
              series={[{ key: "count", label: "Complaints", color: vizColor("amber") }]}
              style={{ height: Math.max(160, byCategory.length * 30 + 40) }}
            />
          ) : (
            <Empty>No complaints in 30 days.</Empty>
          )}
        </SectionCard>
        <SectionCard title="Waiting on the customer" bodyClassName="p-2">
          {v.waiting.length ? (
            <ul>
              {v.waiting.map((r) => (
                <RequestRow key={r.code} r={r} meta={<span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>} />
              ))}
            </ul>
          ) : (
            <Empty>Nobody to chase.</Empty>
          )}
        </SectionCard>
        <SectionCard title="Recently closed" bodyClassName="p-2">
          {v.recent.length ? (
            <ul>
              {v.recent.map((r) => (
                <RequestRow key={r.code} r={r} meta={<StatusBadge status={r.status} />} />
              ))}
            </ul>
          ) : (
            <Empty>Nothing closed yet.</Empty>
          )}
        </SectionCard>
      </div>

      {creating && <NewRequestDialog {...newRequest} onClose={() => setCreating(false)} />}
    </div>
  )
}
