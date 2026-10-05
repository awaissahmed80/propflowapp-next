"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { formatPkr, timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { toast } from "sonner"
import { toastAction } from "@/lib/toast-action"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Tooltip } from "@/components/ui/tooltip"
import { OPEN_STEPS, PAYMENT_PLANS, budgetText, interestText } from "../constants"
import { setLeadStatus } from "../server/leads"
import { LeadDialog, LogDialog } from "./lead-dialog"
import { LeadForm } from "./lead-form"
import { StatusChangeDialog } from "./status-change-dialog"
import { ScoreBadge, ScoreRing } from "./lead-score"
import { DataMenu } from "@/modules/data-io/components/data-menu"
import { BulkActions } from "./bulk-actions"
import { AgentChip, LeadStatusBadge, TempIcon, dueText, telHref, whatsappHref } from "./lead-parts"

const EMPTY = { status: [], source: [], project: [], agent: [], priority: [] }

// Call and WhatsApp straight from a row or card, without opening the lead
const CONTACT = "flex size-8 items-center justify-center rounded-md text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
function QuickContact({ lead, className }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} onClick={(e) => e.stopPropagation()}>
      <Tooltip content="Call">
        <a href={telHref(lead.phone)} aria-label={`Call ${lead.name}`} className={CONTACT}>
          <Icon name="phone-line" />
        </a>
      </Tooltip>
      {lead.whatsapp && (
        <Tooltip content="WhatsApp">
          <a href={whatsappHref(lead.phone, lead.name)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${lead.name}`} className={cn(CONTACT, "hover:text-emerald-600 dark:hover:text-emerald-400")}>
            <Icon name="whatsapp-line" />
          </a>
        </Tooltip>
      )}
    </span>
  )
}

// A lead on the board: who and how warm, what they want and can spend, where they came from,
// then what's next (or how it closed) with Call / WhatsApp on hover and who has it
function LeadCard({ lead: l, active, draggable, staleLimit, onOpen }) {
  const types = useList("unit-type")
  const sources = useList("lead-source")
  const activities = useList("activity-type")
  const reasons = useList("loss-reason")
  const [now] = useState(() => Date.now())
  const due = dueText(l.next?.at, now)
  const i = l.interest
  const want = interestText({ ...i, project: null }, { typeLabel: types.label }).replace(/^—$/, "")
  const budget = budgetText(i, formatPkr)
  const plan = PAYMENT_PLANS.find((p) => p.value === i.paymentPlan)?.label
  const nextType = l.next ? activities.map[l.next.type] : null
  const closed = l.status === "booked" || l.status === "lost"
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/lead", l.code)}
      onClick={() => onOpen(l)}
      aria-current={active ? "true" : undefined}
      className="group cursor-pointer rounded-lg border bg-background shadow-xs transition hover:border-primary/40 hover:shadow-sm aria-[current=true]:border-primary/60 aria-[current=true]:bg-primary/5"
    >
      <div className="space-y-2.5 p-3.5 pb-3">
        {/* Who */}
        <div className="flex items-start gap-2">
          <TempIcon priority={l.priority} className="mt-px" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[15px] leading-tight font-semibold">
              <span className="truncate">{l.name}</span>
              {l.overseas && <Icon name="earth-line" className="shrink-0 text-xs text-muted-foreground" aria-label="Overseas" />}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {l.code} · {timeAgo(l.createdAt)}
            </p>
          </div>
          <ScoreRing score={l.score} className="-mt-1 -mr-1" />
        </div>

        {/* What they want and can spend */}
        {(i.project || want || budget) && (
          <div className="space-y-1 text-[13px]">
            {(i.project || want) && (
              <p className="flex min-w-0 items-center gap-1.5">
                {i.project && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: i.project.color || "#94a3b8" }} aria-hidden />}
                <span className="truncate">{[i.project?.name, want].filter(Boolean).join(" · ")}</span>
              </p>
            )}
            {budget && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Icon name="wallet-3-line" className="shrink-0" />
                <span className="truncate">{[budget, plan].filter(Boolean).join(" · ")}</span>
              </p>
            )}
          </div>
        )}

        {/* Where from, and whether it's gone quiet */}
        {(l.source || staleDays(l, staleLimit) > 0) && (
          <div className="flex flex-wrap items-center gap-1">
            {l.source && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sources.label(l.source)}</span>}
            <StalePill days={staleDays(l, staleLimit)} />
          </div>
        )}
      </div>

      {/* What's next, or how it closed */}
      <div className="flex h-11 items-center gap-2 border-t px-3 text-[13px]">
        {closed ? (
          <span className={cn("flex min-w-0 items-center gap-1 truncate", l.status === "booked" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
            <Icon name={l.status === "booked" ? "checkbox-circle-line" : "close-circle-line"} className="shrink-0" />
            <span className="truncate">{l.status === "booked" ? `Booked ${l.closedAt ? timeAgo(l.closedAt) : ""}` : l.lossReason ? reasons.label(l.lossReason) : "Lost"}</span>
          </span>
        ) : (
          <span className={cn("flex min-w-0 items-center gap-1", l.next ? due.tone : "text-muted-foreground")}>
            <Icon name={nextType?.icon ?? "alarm-line"} className="shrink-0" />
            <span className="truncate">{l.next ? `${nextType?.label ?? "Follow up"} · ${due.text}` : "No follow-up planned"}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {!closed && <QuickContact lead={l} className="hidden group-hover:flex group-focus-within:flex max-md:flex [&_a]:size-7" />}
          {/* Tagged people, overlapping, then the agent */}
          {l.tags?.length > 0 && (
            <Tooltip content={`Tagged: ${l.tags.map((t) => t.name).join(", ")}`}>
              <span className="ml-1 flex -space-x-1.5">
                {l.tags.slice(0, 2).map((t) => (
                  <span key={t.id} className="rounded-full ring-2 ring-background">
                    <Avatar name={t.name} source={t.avatarUrl} size="sm" />
                  </span>
                ))}
                {l.tags.length > 2 && <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-background">+{l.tags.length - 2}</span>}
              </span>
            </Tooltip>
          )}
          {l.agent ? (
            <Tooltip content={`Agent: ${l.agent.name}`}>
              <span className="ml-1">
                <Avatar name={l.agent.name} source={l.agent.avatarUrl} size="sm" />
              </span>
            </Tooltip>
          ) : (
            <Tooltip content="Unassigned">
              <span className="ml-1 flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                <Icon name="user-line" className="text-xs" />
              </span>
            </Tooltip>
          )}
        </span>
      </div>
    </article>
  )
}

// Open leads by status, one column each; drag a card to move it along
function Board({ leads, onOpen, onMove, canEdit, activeCode, staleLimit }) {
  const statuses = useList("lead-status")
  const [over, setOver] = useState(null)

  // ← → buttons: one column at a time, shown only while there's more that way
  const viewport = useRef(null)
  const [can, setCan] = useState({ left: false, right: false })
  useEffect(() => {
    const el = viewport.current
    if (!el) return undefined
    const update = () => setCan({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [])
  const step = (dir) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    viewport.current?.scrollBy({ left: dir * BOARD_COLUMN_STEP, behavior: reduce ? "auto" : "smooth" })
  }

  return (
    // Full-bleed: edge to edge and down to the window's bottom, where the scrollbar sits. The
    // row inside lines the first column up with the page header; each column scrolls its cards.
    <div className="relative -mx-4 h-full sm:-mx-6 lg:-mx-8">
      {can.left && <BoardArrow dir={-1} onClick={() => step(-1)} />}
      {can.right && <BoardArrow dir={1} onClick={() => step(1)} />}
      <ScrollView orientation="horizontal" viewportRef={viewport} className="h-full" viewportClassName="overscroll-x-contain scroll-smooth motion-reduce:scroll-auto">
        <div className="flex h-full w-max gap-3 px-4 pb-4 sm:px-6 lg:px-8">
          {BOARD_STEPS.map((st) => {
            const list = leads.filter((l) => l.status === st)
            return (
              <section
                key={st}
                aria-label={statuses.label(st)}
                onDragOver={(e) => {
                  if (!canEdit) return
                  e.preventDefault()
                  setOver(st)
                }}
                onDragLeave={() => setOver((o) => (o === st ? null : o))}
                onDrop={(e) => {
                  setOver(null)
                  const code = e.dataTransfer.getData("text/lead")
                  if (code) onMove(code, st)
                }}
                className={cn("flex h-full w-80 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors", over === st && "border-primary/50 bg-primary/5")}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <LeadStatusBadge status={st} className="h-7 px-3 text-sm font-semibold" />
                  <span className="text-xs text-muted-foreground tabular-nums" title={["booked", "lost"].includes(st) ? `Last ${CLOSED_ON_BOARD_DAYS} days` : undefined}>
                    {list.length}
                    {["booked", "lost"].includes(st) && <span className="ml-1 opacity-70">· {CLOSED_ON_BOARD_DAYS}d</span>}
                  </span>
                </header>
                <ScrollView className="min-h-0 flex-1" viewportClassName="flex flex-col gap-2 overscroll-auto px-2 pb-2">
                  {list.map((l) => (
                    <LeadCard key={l.code} lead={l} active={l.code === activeCode} draggable={canEdit} staleLimit={staleLimit} onOpen={onOpen} />
                  ))}
                  {!list.length && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{canEdit ? "Drop leads here" : "No leads"}</p>}
                </ScrollView>
              </section>
            )
          })}
        </div>
      </ScrollView>
    </div>
  )
}

// Round ← / → over the board's edge (w-80 column + gap-3 = 332px per step)
const BOARD_COLUMN_STEP = 332
function BoardArrow({ dir, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Scroll left" : "Scroll right"}
      className={cn(
        "absolute top-1/2 z-20 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-background/95 text-lg text-foreground shadow-md backdrop-blur-sm transition hover:bg-background hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        dir < 0 ? "left-2 sm:left-3" : "right-2 sm:right-3",
      )}
    >
      <Icon name={dir < 0 ? "arrow-left-s-line" : "arrow-right-s-line"} />
    </button>
  )
}

// Open lead with no activity for the workspace's set number of days (Settings › CRM) → days, else 0
function staleDays(l, limit, now = Date.now()) {
  if (!limit || !OPEN_STEPS.includes(l.status)) return 0
  const days = Math.floor((now - new Date(l.lastContactAt ?? l.createdAt).getTime()) / 86_400_000)
  return days >= limit ? days : 0
}
export function StalePill({ days, className }) {
  if (!days) return null
  return (
    <Tooltip content={`No activity for ${days} days`}>
      <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/12 px-1.5 py-px text-[11px] font-semibold text-amber-700 dark:text-amber-400", className)}>
        <Icon name="hourglass-line" className="text-[11px]" />
        Stale · {days}d
      </span>
    </Tooltip>
  )
}

// With a lead open beside the table: just who, where they are, what's next and who has them
// (the panel has the rest, including Call and WhatsApp)
const DOCKED_COLUMNS = ["name", "status", "next", "agent"]

// Board columns: every status. Booked and Lost show only recent ones so they don't grow forever
// (older ones are in the Booked / Lost tabs of the list).
const BOARD_STEPS = [...OPEN_STEPS, "booked", "lost"]
const CLOSED_ON_BOARD_DAYS = 30

// prefill: the new-lead form's details when it's opened for a contact (?new=1&contact=ct-00012)
export function LeadsView({ leads, agents, projects, me, access, brand, userName, prefill = null }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const statuses = useList("lead-status")
  const sources = useList("lead-source")
  const priorities = useList("lead-priority")
  const types = useList("unit-type")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState(EMPTY)
  const [selected, setSelected] = useState(() => new Set()) // ticked lead codes (list only)
  const [, startTransition] = useTransition()
  const tab = ["due", "booked", "lost", "archived"].includes(params.get("tab")) ? params.get("tab") : "open"
  const view = params.get("view") === "board" ? "board" : "list"
  const openCode = params.get("lead")
  // Wide screens: the open lead docks next to the table (from the table's top); else a sheet
  const wide = useMediaQuery("(min-width: 1024px)")
  const docked = Boolean(openCode) && view === "list" && wide && leads.length > 0
  const activeCode = docked ? leads.find((l) => urlCode(l.code) === openCode)?.code : undefined

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false })
  }

  // Search and filters first; tabs then split what's left
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, "")
    return leads.filter((l) => {
      if (
        term &&
        !(
          l.name.toLowerCase().includes(term) ||
          (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits.replace(/^0/, ""))) ||
          l.code.toLowerCase().includes(term) ||
          (l.city ?? "").toLowerCase().includes(term)
        )
      )
        return false
      if (filters.status.length && !filters.status.includes(l.status)) return false
      if (filters.source.length && !filters.source.includes(l.source)) return false
      if (filters.project.length && !filters.project.includes(l.interest.project?.code ?? "none")) return false
      if (filters.agent.length && !filters.agent.includes(l.agent ? String(l.agent.id) : "none")) return false
      if (filters.priority.length && !filters.priority.includes(l.priority)) return false
      return true
    })
  }, [leads, q, filters])

  const [now] = useState(() => Date.now())
  const endOfToday = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now) + "T23:59:59+05:00").getTime()
  // Archived leads are out of the pipeline: only in the Archived tab
  const live = filtered.filter((l) => !l.archivedAt)
  const isOpen = (l) => OPEN_STEPS.includes(l.status)
  const isDue = (l) => isOpen(l) && l.next && new Date(l.next.at).getTime() <= endOfToday
  const tabs = {
    open: live.filter(isOpen),
    due: live.filter(isDue).sort((a, b) => new Date(a.next.at) - new Date(b.next.at)),
    booked: live.filter((l) => l.status === "booked"),
    lost: live.filter((l) => l.status === "lost"),
    archived: filtered.filter((l) => l.archivedAt).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)),
  }
  const overdue = tabs.due.filter((l) => new Date(l.next.at).getTime() < now).length
  const recentlyClosed = (l) => ["booked", "lost"].includes(l.status) && l.closedAt && now - new Date(l.closedAt).getTime() < CLOSED_ON_BOARD_DAYS * 86_400_000
  // Ticks only count for rows in the tab being looked at
  const picked = view === "list" ? tabs[tab].filter((l) => selected.has(l.code)) : []
  const shown = view === "board" ? live.filter((l) => isOpen(l) || recentlyClosed(l)) : tabs[tab]

  const groups = [
    { key: "status", label: "Status", icon: "flag-line", options: statuses.options },
    { key: "priority", label: "Temperature", icon: "fire-line", options: priorities.options },
    { key: "source", label: "Source", icon: "megaphone-line", options: sources.options },
    { key: "project", label: "Project", icon: "community-line", options: [...projects.map((p) => ({ value: p.code, label: p.name })), { value: "none", label: "No project" }] },
    ...(access.scope !== "own"
      ? [{ key: "agent", label: "Agent", icon: "user-line", options: [...agents.map((a) => ({ value: String(a.id), label: a.id === me ? `${a.name} (me)` : a.name })), { value: "none", label: "Unassigned" }] }]
      : []),
  ]

  const open = (l) => setParam("lead", urlCode(l.code))
  // Dragging to a status: straight away, unless it's Lost (asks why) or the workspace asks for an
  // update with every change (Settings › CRM)
  const [changing, setChanging] = useState(null) // { code, name, status }
  const [moving, setMoving] = useState(null) // { code, name, status }: just the log form (notes required)
  const [closing, setClosing] = useState(null) // { code, mode }: dragged to Booked / Lost → the lead's Close deal tab
  const move = (code, status, extra = null) => {
    if (!extra && (status === "booked" || status === "lost")) {
      setClosing({ code, mode: status === "booked" ? "won" : "lost" })
      setParam("lead", urlCode(code))
      return
    }
    // Notes required (Settings › CRM): open the lead with its log form set for the move
    if (!extra && access.statusNote) return setMoving({ code, status, name: leads.find((l) => l.code === code)?.name ?? "This lead" })
    if (!extra && status === "lost") return setChanging({ code, status, name: leads.find((l) => l.code === code)?.name ?? "this lead" })
    startTransition(async () => {
      await toastAction(() => setLeadStatus(code, status, extra ?? {}), { loading: "Saving…" })
      setChanging(null)
      router.refresh()
    })
  }

  const columns = [
    {
      key: "name",
      header: "Lead",
      sortValue: (l) => l.name.toLowerCase(),
      cell: (l) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <TempIcon priority={l.priority} />
          <span className="truncate font-medium">{l.name}</span>
          {l.overseas && <Icon name="earth-line" className="shrink-0 text-muted-foreground" title="Overseas" />}
          <StalePill days={staleDays(l, access.staleDays)} />
        </span>
      ),
    },
    {
      key: "interest",
      header: "Looking for",
      sortValue: (l) => interestText(l.interest),
      cell: (l) => <span className="block max-w-72 truncate text-muted-foreground">{interestText(l.interest, { typeLabel: types.label })}</span>,
    },
    { key: "status", header: "Status", sortValue: (l) => OPEN_STEPS.indexOf(l.status), cell: (l) => <LeadStatusBadge status={l.status} /> },
    ...(leads.some((l) => l.score) ? [{ key: "score", header: "Score", sortValue: (l) => l.score?.value ?? -1, cell: (l) => <ScoreBadge score={l.score} /> }] : []),
    { key: "agent", header: "Agent", sortValue: (l) => l.agent?.name ?? "~", cell: (l) => <AgentChip agent={l.agent} /> },
    {
      key: "next",
      header: tab === "archived" ? "Archived" : tab === "booked" || tab === "lost" ? "Closed" : "Next follow-up",
      sortValue: (l) => (tab === "archived" ? new Date(l.archivedAt).getTime() : tab === "booked" || tab === "lost" ? new Date(l.closedAt ?? 0).getTime() : l.next ? new Date(l.next.at).getTime() : Infinity),
      cell: (l) => {
        if (tab === "archived") return <span className="whitespace-nowrap text-muted-foreground">{timeAgo(l.archivedAt)}</span>
        if (tab === "booked" || tab === "lost") return <span className="text-muted-foreground">{l.closedAt ? timeAgo(l.closedAt) : "—"}</span>
        const d = dueText(l.next?.at)
        return <span className={cn("whitespace-nowrap", d.tone)}>{l.next ? d.text : "None planned"}</span>
      },
    },
    { key: "added", header: "Added", sortValue: (l) => new Date(l.createdAt).getTime(), cell: (l) => <span className="whitespace-nowrap text-muted-foreground">{timeAgo(l.createdAt)}</span> },
    { key: "contact", header: <span className="sr-only">Call or WhatsApp</span>, cell: (l) => <QuickContact lead={l} className="justify-end" /> },
  ]

  const TABS = [
    { value: "open", label: "Open", count: tabs.open.length },
    { value: "due", label: "Due today", count: tabs.due.length, alert: overdue > 0 },
    { value: "booked", label: "Booked", count: tabs.booked.length },
    { value: "lost", label: "Lost", count: tabs.lost.length },
    { value: "archived", label: "Archived", count: tabs.archived.length },
  ]

  return (
    // The page fills the screen. List: the table scrolls inside it (sticky header, pagination at the
    // bottom, like Inventory and People). Board: full-height columns down to the window's bottom edge.
    <div className={cn("p-4 transition-[padding] sm:p-6 lg:p-8", leads.length ? "flex h-[calc(100svh-3.5rem)] flex-col gap-4" : "space-y-4", view === "board" && leads.length > 0 && "pb-0 sm:pb-0 lg:pb-0")}>
      <PageHeader
        title="Leads"
        toolbar={
          <>
            <Input
              type="search"
              aria-label="Search leads"
              placeholder="Search name, mobile, city…"
              className="w-full max-w-60"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              startElement={<Icon name="search-line" />}
            />
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            {/* Quick filters (list only): a compact segmented control in the header row */}
            {view === "list" && (
              <div
                role="tablist"
                aria-label="Leads"
                className="flex h-control min-w-0 shrink items-center gap-0.5 overflow-x-auto rounded-md border border-input bg-background p-[3px] shadow-xs [scrollbar-width:none] dark:bg-input/30"
              >
                {TABS.map((t) => {
                  const on = tab === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setParam("tab", t.value === "open" ? null : t.value)}
                      className={cn(
                        "flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                        on ? "bg-muted text-foreground dark:bg-input/60" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-input/40",
                      )}
                    >
                      {t.alert && <span className="size-1.5 rounded-full bg-red-500" />}
                      {t.label}
                      <span className={cn("tabular-nums", on ? "text-muted-foreground" : "opacity-70")}>{t.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        }
        actions={
          <>
            <ToggleGroup
              aria-label="View"
              value={view}
              onChange={(v) => v && setParam("view", v === "board" ? "board" : null)}
              options={[
                { value: "list", label: "List", icon: "list-check" },
                { value: "board", label: "Board", icon: "kanban-view" },
              ]}
            />
            <DataMenu entity="leads" can={{ import: access.create, export: access.export }} extra={["activities"]} />
            {access.create && (
              <Button leftIcon="add-line" onClick={() => setParam("new", "1")}>
                New lead
              </Button>
            )}
          </>
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />

      {/* Bulk actions on the ticked leads of the current tab */}
      {view === "list" && picked.length > 0 && (
        <BulkActions
          picked={picked}
          archivedTab={tab === "archived"}
          access={access}
          agents={agents}
          me={me}
          brand={brand}
          userName={userName}
          onClear={() => setSelected(new Set())}
          onDone={(m) => {
            if (m.tone === "success") setSelected(new Set())
            router.refresh()
          }}
        />
      )}

      {leads.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-4 py-16 text-center">
          <Icon name="user-star-line" className="text-4xl text-muted-foreground" />
          <p className="mt-3 font-medium">No leads yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the enquiries you get from ads, walk-ins and calls, and follow them up here.</p>
          {access.create && (
            <Button className="mt-5" leftIcon="add-line" onClick={() => setParam("new", "1")}>
              Add your first lead
            </Button>
          )}
        </div>
      ) : (
        // List or board; on wide screens the open lead docks beside the list (board opens it in a modal)
        <div className={cn("min-h-0 flex-1", docked && "flex gap-4")}>
          <div className="h-full min-w-0 flex-1">
            {view === "board" ? (
              <Board leads={shown} onOpen={open} onMove={move} canEdit={access.edit} activeCode={activeCode} staleLimit={access.staleDays} />
            ) : (
              <DataTable
                columns={docked ? DOCKED_COLUMNS.map((key) => columns.find((c) => c.key === key)) : columns}
                rows={shown}
                rowKey={(l) => l.code}
                onRowClick={open}
                activeKey={activeCode}
                selectedIds={docked ? undefined : selected}
                onSelectionChange={docked ? undefined : setSelected}
                minWidth={docked ? "30rem" : "56rem"}
                empty={<p className="text-sm text-muted-foreground">{tab === "due" ? "Nothing due today. Nice." : "No leads match."}</p>}
              />
            )}
          </div>
          {docked && (
            <div className="h-full w-[min(44rem,50%)] shrink-0">
              <LeadDialog key={openCode} docked code={openCode} agents={agents} projects={projects} access={access} me={me} onClose={() => setParam("lead", null)} onOpenLead={(c) => setParam("lead", urlCode(c))} />
            </div>
          )}
        </div>
      )}

      {moving && (
        <LogDialog
          code={moving.code}
          name={moving.name}
          statusTo={moving.status}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null)
            toast.success(`${moving.name}: saved, and the status is updated.`)
            router.refresh()
          }}
        />
      )}
      {changing && <StatusChangeDialog name={changing.name} status={changing.status} needUpdate={false} onClose={() => setChanging(null)} onConfirm={(v) => move(changing.code, changing.status, v)} />}
      {openCode && !docked && (
        <LeadDialog
          key={openCode}
          modal={view === "board"}
          code={openCode}
          agents={agents}
          projects={projects}
          access={access}
          me={me}
          initialDeal={closing && urlCode(closing.code) === openCode ? closing.mode : null}
          onClose={() => {
            setClosing(null)
            setParam("lead", null)
          }}
          onOpenLead={(c) => setParam("lead", urlCode(c))}
        />
      )}
      {params.get("new") === "1" && (
        <LeadForm
          agents={agents}
          projects={projects}
          access={access}
          me={me}
          prefill={prefill}
          onClose={() => {
            const next = new URLSearchParams(params)
            next.delete("new")
            next.delete("contact")
            router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false })
          }}
          onSaved={(code) => {
            const next = new URLSearchParams(params)
            next.delete("new")
            next.delete("contact")
            next.set("lead", urlCode(code))
            router.replace(`${pathname}?${next}`, { scroll: false })
          }}
          onOpenExisting={(code) => {
            const next = new URLSearchParams(params)
            next.delete("new")
            next.delete("contact")
            next.set("lead", urlCode(code))
            router.replace(`${pathname}?${next}`, { scroll: false })
          }}
        />
      )}
    </div>
  )
}
