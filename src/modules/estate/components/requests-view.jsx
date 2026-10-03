"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { NDC_PURPOSES, UPDATE_FIELDS } from "../constants"
import { setRequestStatus } from "../server/actions"
import { NewRequestDialog } from "./new-request-dialog"
import { Assignee, CategoryLabel, DueLabel, PriorityBadge, StatusBadge, StepsProgress, TypeBadge, unitLine } from "./service-parts"

// The Service desk (every type) and each type's page: a table with quick views (open, overdue,
// mine, closed), search and filters, or a board by status. Rows open the request.
//   requests: listRequests() · type: one type's page, or null for the desk · me: my user id
//   board: offer the board · defaultLayout: "table" | "board" · banner: shown above the list
//   newRequest: newRequestProps() for the New request dialog · canEdit: move cards on the board

const href = (r) => `/estate-management/requests/${urlCode(r.code)}`
const VIEWS = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "mine", label: "Mine" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
]
const EMPTY = { type: [], status: [], priority: [], category: [], assignee: [], project: [] }
// Statuses a card can be dragged to; finishing happens on the request itself
const MOVABLE = ["in-progress", "awaiting-customer"]
const BOARD_CLOSED_DAYS = 7
const time = (d) => (d ? new Date(d).getTime() : 0)
const PURPOSE = Object.fromEntries(NDC_PURPOSES.map((p) => [p.value, p.label]))
const FIELD = Object.fromEntries(UPDATE_FIELDS.map((p) => [p.value, p.label]))

// Quick views over the list; Mine is my open requests
const inView = (v, r, me) => v === "all" || (v === "open" && !r.closed) || (v === "overdue" && r.overdue) || (v === "closed" && r.closed) || (v === "mine" && r.assignee?.id === me && !r.closed)

// The column that shows what's particular to a type
function typeColumn(type, documents) {
  switch (type) {
    case "transfer":
      return {
        key: "parties",
        header: "Seller → purchaser",
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-1 text-sm">
            <span className="truncate">{r.status === "completed" ? (r.data.from?.name ?? "—") : (r.contact?.name ?? "—")}</span>
            <Icon name="arrow-right-line" className="shrink-0 text-muted-foreground" />
            <span className="truncate">{r.status === "completed" ? (r.contact?.name ?? r.data.to?.name) : (r.data.to?.name ?? "—")}</span>
          </span>
        ),
      }
    case "ndc":
      return {
        key: "ndc",
        header: "Certificate",
        sortValue: (r) => time(r.data.issuedAt),
        cell: (r) =>
          r.data.number ? (
            <span className="block">
              <span className="font-mono text-xs">{r.data.number}</span>
              <span className="block text-xs text-muted-foreground">
                {PURPOSE[r.data.purpose] ?? r.data.purpose} · issued {formatDate(r.data.issuedAt)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{PURPOSE[r.data.purpose] ?? r.data.purpose} · not issued</span>
          ),
      }
    case "possession":
      return {
        key: "letter",
        header: "Possession letter",
        cell: (r) =>
          r.data.letterNo ? (
            <span className="block">
              <span className="font-mono text-xs">{r.data.letterNo}</span>
              <span className="block text-xs text-muted-foreground">Handed over {formatDate(r.data.handedOverAt ?? r.closedAt)}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{r.data.demarcatedAt ? `Demarcated ${formatDate(r.data.demarcatedAt)}` : "Not handed over"}</span>
          ),
      }
    case "complaint":
      return { key: "category", header: "Category", sortValue: (r) => r.data.category ?? "", cell: (r) => <CategoryLabel category={r.data.category} className="text-sm" /> }
    case "document":
      return { key: "kind", header: "Document", cell: (r) => documents.label(r.data.kind) }
    case "record-update":
      return { key: "field", header: "Change", cell: (r) => FIELD[r.data.field] ?? r.data.field }
    default:
      return null
  }
}

// A request on the board
function RequestCard({ r, draggable, onOpen }) {
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/request", r.code)}
      onClick={(e) => !e.defaultPrevented && !e.target.closest("a") && onOpen(r)}
      className="group cursor-pointer rounded-lg border bg-background p-3 shadow-xs transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={href(r)} draggable={false} className="text-sm leading-snug font-medium group-hover:text-primary">
          {r.subject}
        </Link>
        {r.type === "complaint" && <PriorityBadge priority={r.priority} className="shrink-0" />}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        <span className="font-mono">{r.code}</span>
        {r.contact ? ` · ${r.contact.name}` : ""}
        {r.unit ? ` · ${unitLine(r.unit)}` : ""}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2">
        {r.type === "complaint" ? <CategoryLabel category={r.data.category} className="text-[11px] text-muted-foreground" /> : <TypeBadge type={r.type} className="h-4 px-1.5 text-[10px]" />}
        <Assignee person={r.assignee} compact />
      </div>
      <DueLabel request={r} className="mt-1.5" />
    </article>
  )
}

// Requests by status, one column each; drag a card to In progress or Waiting on customer
function Board({ requests, canEdit, onMove, onOpen }) {
  const statuses = useList("service-status")
  const [over, setOver] = useState(null)
  const columns = statuses.values.filter((s) => s.value !== "rejected").map((s) => s.value)
  return (
    <div className="-mx-4 h-full sm:-mx-6 lg:-mx-8">
      <ScrollView orientation="horizontal" className="h-full" viewportClassName="overscroll-x-contain">
        <div className="flex h-full w-max gap-3 px-4 pb-4 sm:px-6 lg:px-8">
          {columns.map((st) => {
            const list = requests.filter((r) => r.status === st)
            const late = list.filter((r) => r.overdue).length
            const droppable = canEdit && MOVABLE.includes(st)
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
                  const code = e.dataTransfer.getData("text/request")
                  if (code) onMove(code, st)
                }}
                className={cn("flex h-full w-76 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors", over === st && (droppable ? "border-primary/50 bg-primary/5" : "border-dashed"))}
              >
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <StatusBadge status={st} className="h-7 px-3 text-sm font-semibold" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {late > 0 && <span className="mr-1.5 text-red-600 dark:text-red-400">{late} overdue ·</span>}
                    {list.length}
                    {st === "completed" && <span className="ml-1 opacity-70">· {BOARD_CLOSED_DAYS}d</span>}
                  </span>
                </header>
                <ScrollView className="min-h-0 flex-1" viewportClassName="flex flex-col gap-2 overscroll-auto px-2 pb-2">
                  {list.map((r) => (
                    <RequestCard key={r.code} r={r} draggable={canEdit && !r.closed} onOpen={onOpen} />
                  ))}
                  {!list.length && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{droppable ? "Drop requests here" : "Nothing here"}</p>}
                </ScrollView>
              </section>
            )
          })}
        </div>
      </ScrollView>
    </div>
  )
}

export function RequestsView({ requests, type = null, title, description, me, board = false, defaultLayout = "table", banner = null, newRequest = null, canEdit = false }) {
  const router = useRouter()
  const params = useSearchParams()
  const types = useList("service-request-type")
  const statuses = useList("service-status")
  const priorities = useList("service-priority")
  const categories = useList("complaint-category")
  const documents = useList("service-document")
  const [now] = useState(() => Date.now())
  const [view, setView] = useState(() => (VIEWS.some((v) => v.value === params.get("view")) ? params.get("view") : "open"))
  const [layout, setLayout] = useState(board ? defaultLayout : "table")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(EMPTY)
  const [creating, setCreating] = useState(() => params.get("new") === "1" && Boolean(newRequest?.canCreate))
  const [, startTransition] = useTransition()

  const groups = useMemo(
    () =>
      [
        !type && { key: "type", label: "Type", icon: "stack-line", options: types.options },
        { key: "status", label: "Status", icon: "flag-line", options: statuses.options },
        (!type || type === "complaint") && { key: "priority", label: "Priority", icon: "alarm-warning-line", options: priorities.options },
        type === "complaint" && { key: "category", label: "Category", icon: "price-tag-3-line", options: categories.options },
        {
          key: "assignee",
          label: "Assigned to",
          icon: "user-line",
          options: [{ value: "none", label: "Unassigned" }, ...new Map(requests.filter((r) => r.assignee).map((r) => [String(r.assignee.id), { value: String(r.assignee.id), label: r.assignee.name }])).values()],
        },
        {
          key: "project",
          label: "Project",
          icon: "community-line",
          options: [...new Map(requests.filter((r) => r.unit?.project?.code).map((r) => [r.unit.project.code, { value: r.unit.project.code, label: r.unit.project.name }])).values()],
        },
      ].filter(Boolean),
    [requests, type, types.options, statuses.options, priorities.options, categories.options],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      if (filters.type.length && !filters.type.includes(r.type)) return false
      if (filters.status.length && !filters.status.includes(r.status)) return false
      if (filters.priority.length && !filters.priority.includes(r.priority)) return false
      if (filters.category.length && !filters.category.includes(r.data.category)) return false
      if (filters.assignee.length && !filters.assignee.includes(r.assignee ? String(r.assignee.id) : "none")) return false
      if (filters.project.length && !filters.project.includes(r.unit?.project?.code)) return false
      if (!q) return true
      return [r.code, r.subject, r.contact?.name, r.contact?.phone, r.booking?.code, r.data.to?.name, r.data.number, r.data.letterNo, unitLine(r.unit)].some((v) => v && String(v).toLowerCase().includes(q))
    })
  }, [requests, filters, search])

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.value, filtered.filter((r) => inView(v.value, r, me)).length])), [filtered, me])
  // The board shows every status as a column, so only All / Mine apply there; it keeps a week of done ones
  const boardView = view === "mine" ? "mine" : "all"
  const visible =
    layout === "board"
      ? filtered.filter((r) => (boardView === "all" || r.assignee?.id === me) && r.status !== "rejected" && (!r.closed || (r.closedAt && now - new Date(r.closedAt).getTime() < BOARD_CLOSED_DAYS * 86_400_000)))
      : filtered.filter((r) => inView(view, r, me))

  const move = (code, status) => {
    const r = requests.find((x) => x.code === code)
    if (!r || r.status === status) return
    if (!MOVABLE.includes(status)) {
      toast.info(status === "completed" ? "Finish it from the request: its checklist and its own button." : "A request can't go back to New.")
      if (status === "completed") router.push(href(r))
      return
    }
    startTransition(async () => {
      const res = await toastAction(() => setRequestStatus(code, status), { loading: "Moving…", success: `${code} moved to ${statuses.label(status)}.` })
      if (res?.ok) router.refresh()
    })
  }

  const typeCol = typeColumn(type, documents)
  const columns = [
    {
      key: "request",
      header: "Request",
      sortValue: (r) => r.subject.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link href={href(r)} className="block truncate font-medium transition-colors group-hover:text-primary">
            {r.subject}
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{r.code}</span>
            {!type && <TypeBadge type={r.type} className="h-4 px-1.5 text-[10px]" />}
            {!type && r.type === "complaint" && <PriorityBadge priority={r.priority} className="h-4 px-1.5 text-[10px]" />}
          </span>
        </div>
      ),
    },
    {
      key: "for",
      header: type === "complaint" ? "Resident" : "Buyer",
      sortValue: (r) => r.contact?.name ?? "",
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate">{r.contact?.name ?? "—"}</span>
          <span className="block truncate text-xs text-muted-foreground">{unitLine(r.unit)}</span>
        </div>
      ),
    },
    ...(typeCol ? [typeCol] : []),
    ...(type === "complaint"
      ? [{ key: "priority", header: "Priority", sortValue: (r) => priorities.values.findIndex((p) => p.value === r.priority), cell: (r) => <PriorityBadge priority={r.priority} /> }]
      : [{ key: "progress", header: "Checklist", sortValue: (r) => r.steps.filter((s) => s.done).length / (r.steps.length || 1), cell: (r) => <StepsProgress steps={r.steps} /> }]),
    { key: "assignee", header: "Assigned to", sortValue: (r) => r.assignee?.name ?? "", cell: (r) => <Assignee person={r.assignee} /> },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => time(r.closed ? r.closedAt : r.dueAt),
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadge status={r.status} />
          <DueLabel request={r} />
        </span>
      ),
    },
    { key: "created", header: "Logged", className: "whitespace-nowrap text-muted-foreground", sortValue: (r) => time(r.createdAt), cell: (r) => timeAgo(r.createdAt) },
  ]

  const canCreate = Boolean(newRequest?.canCreate)
  const newLabel = type ? `New ${(types.label(type) ?? "request").toLowerCase()}` : "New request"
  const viewOptions = (layout === "board" ? VIEWS.filter((v) => ["all", "mine"].includes(v.value)) : VIEWS).map((v) => ({
    value: v.value,
    label: v.value === "overdue" ? `Overdue${counts.overdue ? ` ${counts.overdue}` : ""}` : v.value === "open" ? `Open ${counts.open}` : v.label,
  }))

  return (
    <div className={cn("flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8", layout === "board" && "pb-0 sm:pb-0 lg:pb-0")}>
      <div className="flex flex-col gap-3">
        <PageHeader
          title={title}
          description={`${description} · ${counts.open} open${counts.overdue ? `, ${counts.overdue} overdue` : ""}`}
          toolbar={
            <>
              <ToggleGroup value={layout === "board" ? boardView : view} onChange={(v) => v && setView(v)} options={viewOptions} />
              <div className="min-w-32 flex-1 sm:max-w-72">
                <Input type="search" placeholder="Title, buyer, unit or request no…" aria-label="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
              {board && (
                <ToggleGroup
                  iconOnly
                  aria-label="Layout"
                  value={layout}
                  onChange={(v) => v && setLayout(v)}
                  options={[
                    { value: "table", label: "List", icon: "list-check" },
                    { value: "board", label: "Board", icon: "kanban-view" },
                  ]}
                />
              )}
            </>
          }
          actions={
            canCreate && (
              <Button leftIcon="add-line" onClick={() => setCreating(true)}>
                {newLabel}
              </Button>
            )
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>
      {banner}
      <div className="min-h-0 flex-1">
        {requests.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="home-gear-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No requests yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Log what a buyer or resident asks for. Each request gets a checklist, a fee and a due date.</p>
            {canCreate && (
              <Button className="mt-4" leftIcon="add-line" onClick={() => setCreating(true)}>
                {newLabel}
              </Button>
            )}
          </div>
        ) : layout === "board" ? (
          <Board requests={visible} canEdit={canEdit} onMove={move} onOpen={(r) => router.push(href(r))} />
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(r) => r.code}
            minWidth="64rem"
            onRowClick={(r) => router.push(href(r))}
            empty={<p className="text-sm text-muted-foreground">{view === "overdue" ? "Nothing overdue." : "No requests match."}</p>}
          />
        )}
      </div>
      {creating && <NewRequestDialog type={type} {...newRequest} onClose={() => setCreating(false)} />}
    </div>
  )
}
