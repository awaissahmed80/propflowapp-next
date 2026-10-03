"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { dateRange, timing } from "../constants"
import { CampaignStatusBadge, ChannelIcons, Meter, Objective } from "./campaign-parts"

// Campaigns › Campaigns: every campaign as a table, with quick views over status (running,
// upcoming, ended), search and filters by objective, project and channel

const EMPTY = { objective: [], project: [], channel: [] }
const href = (c) => `/campaigns/all/${urlCode(c.code)}`
// Quick views over status; "running" covers live and paused
const VIEWS = [
  { value: "running", label: "Running" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" },
]
const inView = (view, s) => view === "all" || (view === "running" && ["active", "paused"].includes(s)) || (view === "upcoming" && ["draft", "scheduled"].includes(s)) || (view === "ended" && s === "completed")

export function CampaignsView({ campaigns, canCreate = false }) {
  const router = useRouter()
  const statuses = useList("campaign-status")
  const objectives = useList("campaign-objective")
  const sources = useList("lead-source")
  const [now] = useState(() => Date.now())
  const [search, setSearch] = useState("")
  const [view, setView] = useState("running")
  const [filters, setFilters] = useState(EMPTY)

  const groups = [
    { key: "objective", label: "Objective", icon: "focus-3-line", options: objectives.options },
    {
      key: "project",
      label: "Project",
      icon: "community-line",
      options: [...new Map(campaigns.map((c) => [c.project?.code ?? "", c.project?.name ?? "All projects"]))].map(([value, label]) => ({ value, label })),
    },
    {
      key: "channel",
      label: "Channel",
      icon: "broadcast-line",
      options: sources.options.filter((ch) => campaigns.some((c) => c.channels.some((x) => x.channel === ch.value))),
    },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (filters.objective.length && !filters.objective.includes(c.objective)) return false
      if (filters.project.length && !filters.project.includes(c.project?.code ?? "")) return false
      if (filters.channel.length && !c.channels.some((x) => filters.channel.includes(x.channel))) return false
      return !q || [c.name, c.code, c.project?.name, c.audience].some((v) => v?.toLowerCase().includes(q))
    })
  }, [campaigns, filters, search])
  const visible = filtered.filter((c) => inView(view, c.displayStatus))
  const counts = Object.fromEntries(VIEWS.map((v) => [v.value, filtered.filter((c) => inView(v.value, c.displayStatus)).length]))
  const order = statuses.values.map((s) => s.value)

  const columns = [
    {
      key: "name",
      header: "Campaign",
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <div className="min-w-0">
          <Link href={href(c)} className="block truncate font-medium transition-colors group-hover:text-primary">
            {c.name}
          </Link>
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            <Objective value={c.objective} className="min-w-0" /> · <span className="truncate">{c.project?.name ?? "All projects"}</span>
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (c) => order.indexOf(c.displayStatus), cell: (c) => <CampaignStatusBadge status={c.displayStatus} /> },
    {
      key: "dates",
      header: "Dates",
      className: "whitespace-nowrap",
      sortValue: (c) => c.startDate ?? "9999",
      cell: (c) => (
        <div>
          <span className="block">{dateRange(c)}</span>
          <span className="block text-xs text-muted-foreground">{timing(c, now)}</span>
        </div>
      ),
    },
    { key: "channels", header: "Channels", cell: (c) => <ChannelIcons channels={c.channels.map((x) => x.channel)} /> },
    {
      key: "spend",
      header: "Spend",
      sortValue: (c) => c.results.spend,
      cell: (c) => (
        <div className="w-32">
          <span className="block text-sm tabular-nums">
            {formatPkr(c.results.spend)}
            <span className="text-xs text-muted-foreground"> of {formatPkr(c.results.budget).replace("Rs ", "")}</span>
          </span>
          <Meter className="mt-1" value={c.results.spend} max={c.results.budget} tone={c.results.spend > c.results.budget ? "red" : "primary"} />
        </div>
      ),
    },
    {
      key: "leads",
      header: "Leads",
      sortValue: (c) => c.results.leads,
      cell: (c) => {
        const goal = c.goals.find((g) => g.metric === "leads")
        return (
          <div className="w-24">
            <span className="block tabular-nums">
              <span className="font-medium">{c.results.leads}</span>
              {goal && <span className="text-xs text-muted-foreground"> / {goal.target}</span>}
            </span>
            {goal && <Meter className="mt-1" value={c.results.leads} max={goal.target} tone={c.results.leads >= goal.target ? "green" : "primary"} />}
          </div>
        )
      },
    },
    {
      key: "cpl",
      header: "Cost / lead",
      className: "text-right tabular-nums whitespace-nowrap",
      sortValue: (c) => c.results.cpl ?? Infinity,
      cell: (c) => (c.results.cpl != null ? formatPkr(c.results.cpl) : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "bookings",
      header: "Bookings",
      className: "text-right tabular-nums",
      sortValue: (c) => c.results.bookings,
      cell: (c) => c.results.bookings || <span className="text-muted-foreground">—</span>,
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Campaigns"
          description={`${counts.running} running · ${counts.upcoming} upcoming · ${counts.ended} ended`}
          toolbar={
            <>
              <ToggleGroup value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.value, label: `${v.label} ${counts[v.value] ?? ""}` }))} />
              <div className="min-w-32 flex-1 sm:max-w-72">
                <Input type="search" placeholder="Campaign, project or audience…" aria-label="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
          actions={
            canCreate && (
              <Button leftIcon="add-line" nativeButton={false} render={<Link href="/campaigns/all/new" />}>
                New campaign
              </Button>
            )
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>
      <div className="min-h-0 flex-1">
        {campaigns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="megaphone-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No campaigns yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Plan a launch, booking drive or expo with its channels, budget and goals. Leads from it are counted in CRM.</p>
            {canCreate && (
              <Button className="mt-4" leftIcon="add-line" nativeButton={false} render={<Link href="/campaigns/all/new" />}>
                New campaign
              </Button>
            )}
          </div>
        ) : (
          <DataTable columns={columns} rows={visible} rowKey={(c) => c.code} minWidth="68rem" onRowClick={(c) => router.push(href(c))} empty={<p className="text-sm text-muted-foreground">No campaigns here.</p>} />
        )}
      </div>
    </div>
  )
}
