"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { toHex } from "@/lib/color"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Tooltip } from "@/components/ui/tooltip"
import { areaSqft, formatSize, sizeInMarla } from "../constants"
import { allocateUnits, releaseHolds, unblockUnits } from "../server/inventory"
import { AddUnitsWizard } from "./add-units-wizard"
import { barColor } from "./project-parts"
import { BlockDialog, HoldDialog, RepriceDialog, UnitStatusBadge, holdLeft, ratePer, unitPlace, unitSize, useUnitLabel } from "./unit-parts"
import { UnitDialog } from "./unit-dialog"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const EMPTY = { project: [], block: [], type: [], size: [], feature: [], dealer: [] }
const sizeKey = (u) => `${u.sizeValue}|${u.sizeUnit}`
const sizeOrder = (k) => {
  const [v, unit] = k.split("|")
  // Land sizes by marla, then floor areas by sq ft
  return sizeInMarla(v, unit) ?? 100000 + areaSqft(v, unit, 225)
}

// Status colour (--c) as a soft tint: light fill, slightly stronger border, deeper text; fuller on hover
const TILE =
  "border-[color-mix(in_oklab,var(--c)_35%,transparent)] bg-[color-mix(in_oklab,var(--c)_12%,transparent)] text-[color-mix(in_oklab,var(--c)_75%,var(--foreground))] hover:border-[color-mix(in_oklab,var(--c)_70%,transparent)] hover:bg-[color-mix(in_oklab,var(--c)_22%,transparent)]"

// Keys for the tile markers; the status pills above the board are its colour legend
function MarkerKeys() {
  return (
    <ul className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="relative size-3.5 rounded-sm border bg-muted">
          <span className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full bg-foreground/70" />
        </span>
        Dealer quota
      </li>
      <li className="flex items-center gap-1.5">
        <span className="relative size-3.5 overflow-hidden rounded-sm border bg-muted">
          <span className="absolute top-0 left-0 size-2 bg-foreground/60 [clip-path:polygon(0_0,100%_0,0_100%)]" />
        </span>
        Premium location
      </li>
    </ul>
  )
}

// Board: every unit as a tile, block by block, coloured by status
function Board({ units, onOpen }) {
  const statuses = useList("unit-status")
  const unitLabel = useUnitLabel()
  const blocks = useMemo(() => {
    const map = new Map()
    for (const u of units) {
      const k = `${u.project?.code}|${u.block?.id}`
      if (!map.has(k)) map.set(k, { key: k, project: u.project, phase: u.phase, block: u.block, units: [] })
      map.get(k).units.push(u)
    }
    return [...map.values()].map((b) => ({ ...b, units: b.units.sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true })) }))
  }, [units])
  if (!units.length) return <p className="py-16 text-center text-sm text-muted-foreground">No units match.</p>
  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <section key={b.key} className="rounded-xl border bg-background p-4">
          <h3 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">
              {b.block?.name}{" "}
              <span className="font-normal text-muted-foreground">
                · {b.project?.name} · {b.phase?.name}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {number(b.units.filter((u) => u.status === "available").length)} available of {number(b.units.length)}
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {b.units.map((u) => {
              const s = statuses.map[u.status]
              return (
                <Tooltip key={u.code} content={`${unitLabel(u)} · ${formatSize(u.sizeValue, u.sizeUnit)} · ${formatPkr(u.price)} · ${s?.label ?? u.status}${u.dealer ? ` · ${u.dealer.name}` : ""}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(u)}
                    className={cn(
                      "relative flex h-12 min-w-16 cursor-pointer items-center justify-center overflow-hidden rounded-lg border px-2 font-mono text-xs font-semibold outline-none transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                      TILE,
                      u.status === "blocked" && "line-through",
                    )}
                    style={{ "--c": barColor(s?.color) }}
                  >
                    {u.type === "file" ? u.number.split("-").pop() : u.number}
                    {u.features.length > 0 && <span className="absolute top-0 left-0 size-2.5 bg-(--c) [clip-path:polygon(0_0,100%_0,0_100%)]" />}
                    {u.dealer && <span className="absolute right-1 bottom-1 size-2 rounded-full bg-(--c)" />}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function InventoryView({ units, tree, dealers, canEdit, canCreate }) {
  const router = useRouter()
  const params = useSearchParams()
  const statuses = useList("unit-status")
  const types = useList("unit-type")
  const featureList = useList("feature")
  const unitLabel = useUnitLabel()
  const view = params.get("view") === "board" ? "board" : "table"
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(params.get("status") ?? "")
  // project / block from links (e.g. a project page) apply on arrival
  const [filters, setFilters] = useState(() => ({
    ...EMPTY,
    project: units
      .filter((u) => u.project && urlCode(u.project.code) === params.get("project"))
      .slice(0, 1)
      .map((u) => u.project.code),
    block: params.get("block")
      ? [...new Set(units.filter((u) => u.block?.name === params.get("block") && (!params.get("project") || urlCode(u.project.code) === params.get("project"))).map((u) => String(u.block.id)))]
      : [],
  }))
  const [selected, setSelected] = useState(() => new Set())
  const [dialog, setDialog] = useState(null) // "hold" | "block" | "reprice"
  // ?add=1 (from a project page) opens Add inventory straight away
  const [adding, setAdding] = useState(() => params.get("add") === "1" && canCreate && tree.length > 0)
  const [message, setMessage] = useState(null)
  const [pending, startTransition] = useTransition()
  const [now] = useState(() => Date.now())

  const open = params.get("unit")
  const openUnit = open ? units.find((u) => urlCode(u.code) === open.toLowerCase()) : null
  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`/estate/inventory${next.size ? `?${next}` : ""}`, { scroll: false })
  }

  // Filter options from what's in stock
  const groups = useMemo(() => {
    const uniq = (pairs) => [...new Map(pairs).entries()].map(([value, label]) => ({ value, label }))
    const projectCount = new Set(units.map((u) => u.project?.code)).size
    const blockUnits = filters.project.length ? units.filter((u) => filters.project.includes(u.project?.code)) : units
    return [
      { key: "project", label: "Project", icon: "community-line", options: uniq(units.map((u) => [u.project?.code, u.project?.name])) },
      {
        key: "block",
        label: projectCount === 1 ? "Block · Phase" : "Block · Project",
        icon: "stack-line",
        options: uniq(blockUnits.map((u) => [String(u.block?.id), `${u.block?.name} · ${projectCount === 1 ? u.phase?.name : u.project?.name}`])),
      },
      { key: "type", label: "Type", icon: "layout-grid-line", options: types.options.filter((o) => units.some((u) => u.type === o.value)) },
      {
        key: "size",
        label: "Size",
        icon: "ruler-2-line",
        options: [...new Set(units.map(sizeKey))].sort((a, b) => sizeOrder(a) - sizeOrder(b)).map((k) => ({ value: k, label: formatSize(...k.split("|").map((x, i) => (i ? x : Number(x)))) })),
      },
      { key: "feature", label: "Premium", icon: "star-line", options: featureList.values.filter((f) => units.some((u) => u.features.includes(f.value))).map((f) => ({ value: f.value, label: f.label })) },
      ...(dealers.length || units.some((u) => u.dealer)
        ? [{ key: "dealer", label: "Allocation", icon: "shake-hands-line", options: [{ value: "company", label: "Company stock" }, ...uniq(units.filter((u) => u.dealer).map((u) => [u.dealer.code, u.dealer.name]))] }]
        : []),
    ]
  }, [units, filters.project, types.options, featureList.values, dealers.length])

  // Everything but the status pill, then the pill
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return units.filter((u) => {
      if (filters.project.length && !filters.project.includes(u.project?.code)) return false
      if (filters.block.length && !filters.block.includes(String(u.block?.id))) return false
      if (filters.type.length && !filters.type.includes(u.type)) return false
      if (filters.size.length && !filters.size.includes(sizeKey(u))) return false
      if (filters.feature.length && !filters.feature.some((f) => u.features.includes(f))) return false
      if (filters.dealer.length && !filters.dealer.includes(u.dealer?.code ?? "company")) return false
      return !q || [u.number, u.code, unitLabel(u), u.block?.name, u.street, u.project?.name, u.dealer?.name, u.hold?.by].some((v) => v?.toLowerCase().includes(q))
    })
  }, [units, filters, search, unitLabel])
  const visible = status ? filtered.filter((u) => u.status === status) : filtered
  const counts = Object.fromEntries(statuses.values.map((s) => [s.value, filtered.filter((u) => u.status === s.value).length]))
  const availableValue = visible.filter((u) => u.status === "available").reduce((s, u) => s + u.price, 0)

  const picked = visible.filter((u) => selected.has(u.code))
  const codes = picked.map((u) => u.code)
  const done = (verb) => (r) => {
    setMessage({ tone: "success", text: `${r.changed} ${r.changed === 1 ? "unit" : "units"} ${verb}${r.skipped ? ` · ${r.skipped} skipped (not applicable)` : ""}.` })
    setSelected(new Set())
  }
  const act = (fn, verb) =>
    startTransition(async () => {
      setMessage(null)
      const r = await fn()
      if (r?.error) setMessage({ tone: "error", text: r.error })
      else {
        done(verb)(r)
        router.refresh()
      }
    })

  const columns = [
    {
      key: "unit",
      header: "Unit",
      sortValue: (u) => `${u.project?.name}|${u.block?.name}|${u.number.padStart(8, "0")}`,
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base text-white" style={{ backgroundColor: u.project?.color }}>
            <Icon name={types.map[u.type]?.icon ?? "layout-grid-line"} />
          </span>
          <div className="min-w-0">
            <span className="block truncate font-medium group-hover:text-primary">{unitLabel(u)}</span>
            <span className="block truncate text-xs text-muted-foreground">{unitPlace(u)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      sortValue: (u) => u.project?.name ?? "",
      cell: (u) => (
        <div className="min-w-0">
          <span className="block truncate">{u.project?.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{u.phase?.name}</span>
        </div>
      ),
    },
    { key: "size", header: "Size", sortValue: (u) => sizeOrder(sizeKey(u)), cell: (u) => <span className="whitespace-nowrap">{unitSize(u)}</span> },
    {
      key: "premium",
      header: "Premium",
      cell: (u) =>
        u.premiums.length ? (
          <div className="flex flex-wrap gap-1">
            {u.premiums.map((p) => (
              <Badge key={p.feature} color="gray">
                {featureList.label(p.feature)} +{p.percent}%
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      className: "text-right whitespace-nowrap",
      sortValue: (u) => u.price,
      cell: (u) => (
        <div>
          <span className="block font-medium tabular-nums">{formatPkr(u.price)}</span>
          <span className="block text-xs text-muted-foreground">{ratePer(u)}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (u) => statuses.values.findIndex((s) => s.value === u.status),
      cell: (u) => {
        const left = u.hold ? holdLeft(u.hold.expiresAt, now) : null
        return (
          <div>
            <UnitStatusBadge status={u.status} />
            {left && <span className={cn("mt-0.5 block text-xs", left.soon ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{left.text}</span>}
          </div>
        )
      },
    },
    ...(dealers.length || units.some((u) => u.dealer)
      ? [{ key: "dealer", header: "Allocated to", sortValue: (u) => u.dealer?.name ?? "", cell: (u) => (u.dealer ? u.dealer.name : <span className="text-muted-foreground">Company</span>) }]
      : []),
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Inventory"
          toolbar={
            units.length > 0 && (
              <>
                <div className="min-w-32 flex-1 sm:max-w-80">
                  <Input
                    type="search"
                    placeholder="Plot no., file no., block, dealer…"
                    aria-label="Search inventory"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    startElement={<Icon name="search-line" />}
                  />
                </div>
                <FilterMenu groups={groups} value={filters} onChange={setFilters} />
              </>
            )
          }
          info={units.length > 0 && `${number(visible.length)} units · ${formatPkr(availableValue)} available`}
          actions={
            <>
              {units.length > 0 && (
                <ToggleGroup
                  value={view}
                  onChange={(v) => v && setParam("view", v === "board" ? "board" : null)}
                  options={[
                    { value: "table", label: "Table", icon: "table-line" },
                    { value: "board", label: "Board", icon: "layout-grid-line" },
                  ]}
                />
              )}
              {canCreate && tree.length > 0 && (
                <Button leftIcon="add-line" onClick={() => setAdding(true)}>
                  Add inventory
                </Button>
              )}
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
        {units.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
              {[{ value: "", label: "All", color: null }, ...statuses.values].map((s) => {
                const on = status === s.value
                const n = s.value ? counts[s.value] : filtered.length
                return (
                  <button
                    key={s.value || "all"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStatus(s.value)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.color &&
                      (view === "board" ? (
                        <span className={cn("size-3 rounded-sm border", TILE)} style={{ "--c": barColor(s.color) }} />
                      ) : (
                        <span className="size-2 rounded-full" style={{ backgroundColor: toHex(s.color) ?? barColor(s.color) }} />
                      ))}
                    {s.label}
                    <span className="tabular-nums opacity-80">{number(n)}</span>
                  </button>
                )
              })}
            </div>
            {view === "board" && <MarkerKeys />}
          </div>
        )}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </div>

      {/* Bulk actions on the selected units */}
      {view === "table" && picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">
            {number(picked.length)} selected · {formatPkr(picked.reduce((s, u) => s + u.price, 0))}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          {canEdit && (
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" leftIcon="lock-line" onClick={() => setDialog("hold")}>
                Hold
              </Button>
              <Button size="sm" variant="outline" leftIcon="lock-unlock-line" disabled={pending} onClick={() => act(() => releaseHolds(codes), "released")}>
                Release
              </Button>
              {dealers.length > 0 && (
                <DropdownMenu
                  align="end"
                  items={[
                    { type: "label", label: `Allocate ${picked.length} to` },
                    ...dealers.map((d) => ({ key: d.code, label: d.name, onClick: () => act(() => allocateUnits(codes, d.code), `allocated to ${d.name}`) })),
                    { type: "separator" },
                    { label: "Return to company stock", icon: "arrow-go-back-line", onClick: () => act(() => allocateUnits(codes, null), "returned to company stock") },
                  ]}
                  trigger={
                    <Button size="sm" variant="outline" leftIcon="shake-hands-line" disabled={pending}>
                      Dealer quota
                    </Button>
                  }
                />
              )}
              <Button size="sm" variant="outline" leftIcon="price-tag-3-line" onClick={() => setDialog("reprice")}>
                Revise price
              </Button>
              <DropdownMenu
                align="end"
                items={[
                  { label: `Block ${picked.length}`, icon: "forbid-line", onClick: () => setDialog("block") },
                  { label: `Unblock ${picked.length}`, icon: "checkbox-circle-line", onClick: () => act(() => unblockUnits(codes), "unblocked") },
                ]}
                trigger={<Button variant="outline" size="smicon" leftIcon="more-2-line" aria-label="More actions" />}
              />
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {units.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="layout-grid-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">{tree.length ? "No inventory yet" : "Create a project first"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {tree.length ? "Add plots, files, houses, apartments and shops to your projects' blocks, a whole series at a time." : "Inventory lives in a project's blocks."}
            </p>
            {canCreate && tree.length > 0 && (
              <Button className="mt-4" leftIcon="add-line" onClick={() => setAdding(true)}>
                Add inventory
              </Button>
            )}
          </div>
        ) : view === "board" ? (
          <ScrollView className="h-full" viewportClassName="pb-2">
            <Board units={visible} onOpen={(u) => setParam("unit", urlCode(u.code))} />
          </ScrollView>
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(u) => u.code}
            minWidth="68rem"
            onRowClick={(u) => setParam("unit", urlCode(u.code))}
            selectedIds={canEdit ? selected : undefined}
            onSelectionChange={canEdit ? setSelected : undefined}
            empty="No units match."
          />
        )}
      </div>

      {openUnit && <UnitDialog unit={openUnit} priceList={tree.find((p) => p.code === openUnit.project?.code)?.priceList} canEdit={canEdit} dealers={dealers} onClose={() => setParam("unit", null)} />}
      {adding && (
        <AddUnitsWizard
          tree={tree}
          initialProject={params.get("project")}
          initialBlock={params.get("block")}
          onClose={() => {
            setAdding(false)
            if (params.get("add")) setParam("add", null)
          }}
          onAdded={(text) => setMessage({ tone: "success", text })}
        />
      )}
      {dialog === "hold" && <HoldDialog codes={codes} title={`Put ${picked.length} ${picked.length === 1 ? "unit" : "units"} on hold`} onClose={() => setDialog(null)} onDone={done("put on hold")} />}
      {dialog === "block" && <BlockDialog codes={codes} title={`Block ${picked.length} ${picked.length === 1 ? "unit" : "units"}`} onClose={() => setDialog(null)} onDone={done("blocked")} />}
      {dialog === "reprice" && <RepriceDialog units={picked} onClose={() => setDialog(null)} onDone={done("repriced")} />}
    </div>
  )
}
