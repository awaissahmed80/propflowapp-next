"use client"

import { useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Tooltip } from "@/components/ui/tooltip"
import { OPEN_STEPS, interestText } from "../constants"
import { setLeadStatus } from "../server/leads"
import { LeadDialog } from "./lead-dialog"
import { LeadForm } from "./lead-form"
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

// Open leads by status, one column each; drag a card to move it along
function Board({ leads, onOpen, onMove, canEdit }) {
  const statuses = useList("lead-status")
  const types = useList("unit-type")
  const [over, setOver] = useState(null)
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {OPEN_STEPS.map((st) => {
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
            className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors", over === st && "border-primary/50 bg-primary/5")}
          >
            <header className="flex items-center justify-between px-3 py-2.5">
              <LeadStatusBadge status={st} />
              <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
            </header>
            <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
              {list.map((l) => {
                const due = dueText(l.next?.at)
                return (
                  <article
                    key={l.code}
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/lead", l.code)}
                    onClick={() => onOpen(l)}
                    className="group cursor-pointer rounded-lg border bg-background p-3 shadow-xs transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <TempIcon priority={l.priority} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                      <QuickContact lead={l} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{interestText(l.interest, { typeLabel: types.label })}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className={cn("flex items-center gap-1", due.tone)}>
                        {l.next && <Icon name="alarm-line" />}
                        {l.next ? due.text : "No follow-up"}
                      </span>
                      {l.agent && <Avatar name={l.agent.name} source={l.agent.avatarUrl} size="sm" />}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function LeadsView({ leads, agents, projects, me, access }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const statuses = useList("lead-status")
  const sources = useList("lead-source")
  const priorities = useList("lead-priority")
  const types = useList("unit-type")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState(EMPTY)
  const [message, setMessage] = useState(null)
  const [, startTransition] = useTransition()
  const tab = ["due", "booked", "lost"].includes(params.get("tab")) ? params.get("tab") : "open"
  const view = params.get("view") === "board" ? "board" : "list"
  const openCode = params.get("lead")

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
      if (term && !(l.name.toLowerCase().includes(term) || (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits.replace(/^0/, ""))) || l.code.toLowerCase().includes(term) || (l.city ?? "").toLowerCase().includes(term))) return false
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
  const isOpen = (l) => OPEN_STEPS.includes(l.status)
  const isDue = (l) => isOpen(l) && l.next && new Date(l.next.at).getTime() <= endOfToday
  const tabs = {
    open: filtered.filter(isOpen),
    due: filtered.filter(isDue).sort((a, b) => new Date(a.next.at) - new Date(b.next.at)),
    booked: filtered.filter((l) => l.status === "booked"),
    lost: filtered.filter((l) => l.status === "lost"),
  }
  const overdue = tabs.due.filter((l) => new Date(l.next.at).getTime() < now).length
  const shown = view === "board" ? tabs.open : tabs[tab]

  const groups = [
    { key: "status", label: "Status", icon: "flag-line", options: statuses.options },
    { key: "priority", label: "Temperature", icon: "fire-line", options: priorities.options },
    { key: "source", label: "Source", icon: "megaphone-line", options: sources.options },
    { key: "project", label: "Project", icon: "community-line", options: [...projects.map((p) => ({ value: p.code, label: p.name })), { value: "none", label: "No project" }] },
    ...(access.scope !== "own" ? [{ key: "agent", label: "Agent", icon: "user-line", options: [...agents.map((a) => ({ value: String(a.id), label: a.id === me ? `${a.name} (me)` : a.name })), { value: "none", label: "Unassigned" }] }] : []),
  ]

  const open = (l) => setParam("lead", urlCode(l.code))
  const move = (code, status) =>
    startTransition(async () => {
      const r = await setLeadStatus(code, status)
      if (r.error) setMessage({ tone: "error", text: r.error })
      router.refresh()
    })

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
        </span>
      ),
    },
    { key: "interest", header: "Looking for", sortValue: (l) => interestText(l.interest), cell: (l) => <span className="block max-w-72 truncate text-muted-foreground">{interestText(l.interest, { typeLabel: types.label })}</span> },
    { key: "status", header: "Status", sortValue: (l) => OPEN_STEPS.indexOf(l.status), cell: (l) => <LeadStatusBadge status={l.status} /> },
    { key: "agent", header: "Agent", sortValue: (l) => l.agent?.name ?? "~", cell: (l) => <AgentChip agent={l.agent} /> },
    {
      key: "next",
      header: tab === "booked" || tab === "lost" ? "Closed" : "Next follow-up",
      sortValue: (l) => (tab === "booked" || tab === "lost" ? new Date(l.closedAt ?? 0).getTime() : l.next ? new Date(l.next.at).getTime() : Infinity),
      cell: (l) => {
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
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Leads"
        toolbar={
          <>
            <Input type="search" aria-label="Search leads" placeholder="Search name, mobile, city…" className="w-full max-w-72" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
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
            {access.create && (
              <Button leftIcon="add-line" onClick={() => setParam("new", "1")}>
                New lead
              </Button>
            )}
          </>
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />

      {view === "list" && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Leads">
          {TABS.map((t) => {
            const on = tab === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParam("tab", t.value === "open" ? null : t.value)}
                className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
              >
                {t.alert && <span className={cn("size-1.5 rounded-full", on ? "bg-primary-foreground" : "bg-red-500")} />}
                {t.label}
                <span className="tabular-nums opacity-80">{t.count}</span>
              </button>
            )
          })}
        </div>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

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
      ) : view === "board" ? (
        <Board leads={shown} onOpen={open} onMove={move} canEdit={access.edit} />
      ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(l) => l.code}
          onRowClick={open}
          minWidth="56rem"
          empty={<p className="text-sm text-muted-foreground">{tab === "due" ? "Nothing due today. Nice." : "No leads match."}</p>}
        />
      )}

      {openCode && <LeadDialog code={openCode} agents={agents} projects={projects} access={access} me={me} onClose={() => setParam("lead", null)} />}
      {params.get("new") === "1" && (
        <LeadForm
          agents={agents}
          projects={projects}
          access={access}
          me={me}
          onClose={() => setParam("new", null)}
          onSaved={(code) => {
            const next = new URLSearchParams(params)
            next.delete("new")
            next.set("lead", urlCode(code))
            router.replace(`${pathname}?${next}`, { scroll: false })
          }}
          onOpenExisting={(code) => {
            const next = new URLSearchParams(params)
            next.delete("new")
            next.set("lead", urlCode(code))
            router.replace(`${pathname}?${next}`, { scroll: false })
          }}
        />
      )}
    </div>
  )
}
