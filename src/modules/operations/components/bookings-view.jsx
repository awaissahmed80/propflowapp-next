"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { PaidMeter, STAGES, StageBadge, StatusBadge, useUnitText } from "./sales-parts"

// Sales › Bookings: every booking this person may see, as a table
const EMPTY = { stage: [], status: [], project: [], health: [], mine: [] }
const digits = (s) => String(s ?? "").replace(/\D/g, "")
const href = (b) => `/operations/bookings/${urlCode(b.code)}`
const CLOSED = ["cancelled", "refunded"]

export function BookingsView({ bookings, projects, canCreate = false }) {
  const router = useRouter()
  const params = useSearchParams()
  const stages = useList("booking-stage")
  const statuses = useList("booking-status")
  const unitText = useUnitText()
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState(() => ({
    ...EMPTY,
    stage: params.get("stage") ? [params.get("stage")] : [],
    status: params.get("status") ? [params.get("status")] : [],
    health: params.get("health") ? [params.get("health")] : [],
    mine: params.get("mine") ? [params.get("mine")] : [],
  }))

  const groups = [
    {
      key: "mine",
      label: "Mine",
      icon: "user-star-line",
      options: [
        { value: "handling", label: "I handle" },
        { value: "sold", label: "I sold" },
      ],
    },
    { key: "stage", label: "Stage", icon: "flag-line", options: stages.options },
    { key: "status", label: "Status", icon: "pulse-line", options: statuses.options },
    { key: "project", label: "Project", icon: "community-line", options: projects.map((p) => ({ value: p.code, label: p.name })) },
    {
      key: "health",
      label: "Payments",
      icon: "wallet-3-line",
      options: [
        { value: "overdue", label: "Overdue" },
        { value: "current", label: "On track" },
        { value: "paid", label: "Paid in full" },
        { value: "no-plan", label: "No payment plan yet" },
      ],
    },
  ]

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const d = digits(term)
    return bookings.filter((b) => {
      if (filters.stage.length && !filters.stage.includes(b.stage)) return false
      if (filters.status.length && !filters.status.includes(b.status)) return false
      if (filters.project.length && !filters.project.includes(b.project.code)) return false
      if (filters.mine.length && !((filters.mine.includes("handling") && b.handledByMe) || (filters.mine.includes("sold") && b.soldByMe))) return false
      if (filters.health.length) {
        const h = !b.plan ? "no-plan" : b.balance <= 0 ? "paid" : b.overdueAmount > 0 ? "overdue" : "current"
        if (!filters.health.includes(h)) return false
      }
      if (!term) return true
      return (
        [b.buyer.name, b.code, b.unit.number, b.unit.block, b.project.name, b.allotmentNo].some((v) => v?.toLowerCase().includes(term)) ||
        (d.length >= 4 && [b.buyer.phone, b.buyer.cnic].some((v) => digits(v).includes(d)))
      )
    })
  }, [bookings, filters, q])

  const open = shown.filter((b) => !CLOSED.includes(b.status))
  const toCollect = open.reduce((s, b) => s + b.balance, 0)

  const columns = [
    {
      key: "buyer",
      header: "Booking",
      sortValue: (b) => b.buyer.name.toLowerCase(),
      cell: (b) => (
        <div className="min-w-0">
          <Link href={href(b)} className="block truncate font-medium transition-colors group-hover:text-primary">
            {b.buyer.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{[b.code, b.buyer.guardian, b.buyer.cnic].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      sortValue: (b) => `${b.project.name} ${b.unit.number}`,
      cell: (b) => (
        <div className="min-w-0">
          <span className="block truncate">
            {b.unit.number} <span className="text-muted-foreground">· {unitText(b.unit)}</span>
          </span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: b.project.color || "#94a3b8" }} />
            {[b.unit.block, b.project.name].filter(Boolean).join(" · ")}
          </span>
        </div>
      ),
    },
    { key: "stage", header: "Stage", sortValue: (b) => STAGES.indexOf(b.stage), cell: (b) => <StageBadge stage={b.stage} /> },
    {
      key: "plan",
      header: "Plan",
      sortValue: (b) => b.plan?.name ?? "~",
      cell: (b) => (b.plan ? <span className="truncate">{b.plan.name}</span> : <span className="text-amber-600 dark:text-amber-400">Not set up</span>),
    },
    { key: "net", header: "Price", className: "text-right whitespace-nowrap tabular-nums", sortValue: (b) => b.net, cell: (b) => formatPkr(b.net) },
    {
      key: "paid",
      header: "Paid",
      sortValue: (b) => b.paidPct,
      cell: (b) => (
        <div className="w-28">
          <span className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
            <span className="font-medium text-foreground">{formatPkr(b.received)}</span>
            <span className="text-muted-foreground">{b.paidPct}%</span>
          </span>
          <PaidMeter pct={b.paidPct} overdue={b.overdueAmount > 0} className="mt-1" />
        </div>
      ),
    },
    {
      key: "overdue",
      header: "Overdue",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (b) => b.overdueAmount,
      cell: (b) =>
        b.overdueAmount > 0 ? (
          <span className="text-red-600 dark:text-red-400">
            {formatPkr(b.overdueAmount)} <span className="text-xs opacity-80">· {b.overdueCount}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "status", header: "Status", sortValue: (b) => b.status, cell: (b) => <StatusBadge status={b.status} /> },
    {
      key: "agent",
      header: "Handled by",
      sortValue: (b) => b.agent?.name ?? "",
      cell: (b) =>
        b.agent ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={b.agent.name} source={b.agent.avatarUrl} size="xs" />
            <span className="min-w-0">
              <span className="block truncate">{b.agent.name}</span>
              {b.soldBy && <span className="block truncate text-xs text-muted-foreground">sold by {b.soldBy.name}</span>}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "booked", header: "Booked", className: "whitespace-nowrap text-muted-foreground", sortValue: (b) => new Date(b.bookedAt).getTime(), cell: (b) => formatDate(b.bookedAt) },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Bookings"
          description={`${open.length} open ${open.length === 1 ? "booking" : "bookings"} · ${formatPkr(toCollect)} still to collect`}
          toolbar={
            <>
              <div className="min-w-32 flex-1 sm:max-w-80">
                <Input type="search" aria-label="Search bookings" placeholder="Buyer, booking, unit, CNIC or mobile…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
          actions={
            <>
              {canCreate && (
                <Button leftIcon="add-line" nativeButton={false} render={<Link href="/operations/bookings/new" />}>
                  New booking
                </Button>
              )}
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>

      <div className="min-h-0 flex-1">
        {bookings.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="hand-coin-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No bookings yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Bookings come in from CRM when a lead is closed as won with a unit (the lead&apos;s Close deal tab).</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(b) => b.code}
            minWidth="80rem"
            onRowClick={(b) => router.push(href(b))}
            defaultSort={{ key: "booked", dir: "desc" }}
            empty={<p className="text-sm text-muted-foreground">No bookings match.</p>}
          />
        )}
      </div>
    </div>
  )
}
