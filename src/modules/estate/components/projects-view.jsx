"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatPkr } from "@/lib/format"
import { isInteractiveClick } from "@/lib/interaction"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { formatArea } from "../constants"
import { projectHref } from "../links"
import { ApprovalBadge, AvailabilityBar, ProjectMark, ProjectStatusBadge } from "./project-parts"
import { ProjectWizard } from "./project-wizard"

const EMPTY_FILTERS = { status: [], type: [], city: [] }
const number = (n) => new Intl.NumberFormat("en-PK").format(n)

function ProjectCard({ project, typeLabel, onOpen }) {
  const { stats } = project
  return (
    <article
      onClick={(e) => !isInteractiveClick(e) && onOpen(project)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-background shadow-xs transition duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transition-none"
    >
      {project.coverUrl && (
        <div className="aspect-[16/7] overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
          <img src={project.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <ProjectMark project={project} />
          <div className="min-w-0 flex-1">
            <Link href={projectHref(project.code)} className="line-clamp-2 leading-snug font-medium transition-colors group-hover:text-primary">
              {project.name}
            </Link>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="map-pin-2-line" className="shrink-0" />
              <span className="truncate">{project.location}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ProjectStatusBadge status={project.status} />
          <ApprovalBadge approval={project.approval} authority={project.authority} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {typeLabel} · {formatArea(project.totalArea, project.areaUnit)} · {project.phaseCount} {project.phaseCount === 1 ? "phase" : "phases"}
        </p>
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span>
              <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">{number(stats.counts.available)}</span> <span className="text-muted-foreground">available of {number(stats.total)}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">{stats.soldPct}% sold</span>
          </div>
          <AvailabilityBar stats={stats} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 border-t pt-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">Units</dt>
            <dd className="text-sm font-semibold tabular-nums">{number(stats.total)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[11px] text-muted-foreground">Available stock</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatPkr(stats.availableValue)}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

// Projects: cards or a table, with search, filters and portfolio totals
export function ProjectsView({ projects, view, canCreate }) {
  const router = useRouter()
  const statuses = useList("project-status")
  const types = useList("project-type")
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const open = (p) => router.push(projectHref(p.code))
  const setView = (next) => router.replace(next === "table" ? "/estate/projects?view=table" : "/estate/projects", { scroll: false })

  const cities = useMemo(() => [...new Set(projects.map((p) => p.city).filter(Boolean))].sort(), [projects])
  const groups = [
    {
      key: "status",
      label: "Status",
      icon: "flag-line",
      options: statuses.options.filter((o) => projects.some((p) => p.status === o.value)),
    },
    {
      key: "type",
      label: "Type",
      icon: "building-2-line",
      options: types.options.filter((o) => projects.some((p) => p.type === o.value)),
    },
    {
      key: "city",
      label: "City",
      icon: "map-pin-2-line",
      options: cities.map((c) => ({ value: c, label: c })),
    },
  ]
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (filters.status.length && !filters.status.includes(p.status)) return false
      if (filters.type.length && !filters.type.includes(p.type)) return false
      if (filters.city.length && !filters.city.includes(p.city)) return false
      return !q || [p.name, p.code, p.city, p.location, p.authority].some((v) => v?.toLowerCase().includes(q))
    })
  }, [projects, filters, search])
  const totals = useMemo(() => {
    const t = { units: 0, available: 0, committed: 0, availableValue: 0 }
    for (const p of filtered) {
      t.units += p.stats.total
      t.available += p.stats.counts.available
      t.committed += p.stats.counts.booked + p.stats.counts.sold
      t.availableValue += p.stats.availableValue
    }
    return t
  }, [filtered])

  const columns = [
    {
      key: "name",
      header: "Project",
      className: "max-w-80",
      sortValue: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProjectMark project={p} size="sm" />
          <div className="min-w-0">
            <Link href={projectHref(p.code)} className="block truncate font-medium transition-colors group-hover:text-primary">
              {p.name}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">{p.location}</span>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (p) => types.label(p.type),
      cell: (p) => types.label(p.type),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (p) => statuses.values.findIndex((s) => s.value === p.status),
      cell: (p) => <ProjectStatusBadge status={p.status} />,
    },
    {
      key: "approval",
      header: "Approval",
      cell: (p) => <ApprovalBadge approval={p.approval} authority={p.authority} />,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      className: "text-right tabular-nums",
      sortValue: (p) => p.stats.total,
      cell: (p) => number(p.stats.total),
    },
    {
      key: "available",
      header: "Available",
      align: "right",
      className: "text-right font-medium text-emerald-600 tabular-nums dark:text-emerald-400",
      sortValue: (p) => p.stats.counts.available,
      cell: (p) => number(p.stats.counts.available),
    },
    {
      key: "availability",
      header: "Availability",
      className: "w-40",
      sortValue: (p) => p.stats.soldPct,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <AvailabilityBar stats={p.stats} className="flex-1" />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{p.stats.soldPct}%</span>
        </div>
      ),
    },
    {
      key: "value",
      header: "Available stock",
      align: "right",
      className: "whitespace-nowrap text-right font-medium tabular-nums",
      sortValue: (p) => p.stats.availableValue,
      cell: (p) => formatPkr(p.stats.availableValue),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Projects"
          toolbar={
            projects.length > 0 && (
              <>
                <div className="min-w-32 flex-1 sm:max-w-80">
                  <Input type="search" placeholder="Search projects, cities, codes…" aria-label="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
                </div>
                <FilterMenu groups={groups} value={filters} onChange={setFilters} />
              </>
            )
          }
          info={projects.length > 0 && `${filtered.length} of ${projects.length} projects`}
          actions={
            <>
              {projects.length > 0 && (
                <ToggleGroup
                  value={view}
                  onChange={(v) => v && setView(v)}
                  options={[
                    {
                      value: "cards",
                      label: "Cards",
                      icon: "layout-grid-line",
                    },
                    { value: "table", label: "Table", icon: "table-line" },
                  ]}
                />
              )}
              {canCreate && (
                <Button leftIcon="add-line" onClick={() => setCreating(true)}>
                  New project
                </Button>
              )}
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>

      {projects.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="community-line" label="Projects" value={filtered.length} hint={`${cities.length} ${cities.length === 1 ? "city" : "cities"}`} />
          <StatTile icon="layout-grid-line" tone="sky" label="Total units" value={number(totals.units)} hint="Plots, files, houses, apartments, shops" />
          <StatTile icon="checkbox-circle-line" tone="green" label="Available" value={number(totals.available)} hint={`${formatPkr(totals.availableValue)} in stock`} />
          <StatTile icon="hand-coin-line" tone="violet" label="Booked or sold" value={`${totals.units ? Math.round((totals.committed / totals.units) * 100) : 0}%`} hint={`${number(totals.committed)} units`} />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="community-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No projects yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add the societies, towers and malls you develop or market, with their phases and blocks. Inventory goes into their blocks.</p>
            {canCreate && (
              <Button className="mt-4" leftIcon="add-line" onClick={() => setCreating(true)}>
                New project
              </Button>
            )}
          </div>
        ) : view === "cards" ? (
          <ScrollView className="-mx-1 h-full" viewportClassName="px-1 pt-1 pb-2">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No projects match your filters.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filtered.map((p) => (
                  <ProjectCard key={p.code} project={p} typeLabel={types.label(p.type)} onOpen={open} />
                ))}
              </div>
            )}
          </ScrollView>
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(p) => p.code} minWidth="68rem" onRowClick={open} />
        )}
      </div>
      {creating && <ProjectWizard onClose={() => setCreating(false)} />}
    </div>
  )
}
