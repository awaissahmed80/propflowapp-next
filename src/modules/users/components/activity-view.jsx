"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { formatDateTime, timeAgo } from "@/lib/format"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ACTIVITY_TYPES } from "../constants"
import { memberHref } from "../links"

const TYPE = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.value, t]))

// Activity Log: who did what in the workspace, newest first, searchable and filterable
export function ActivityView({ rows }) {
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ type: [], person: [] })

  const groups = useMemo(
    () => [
      { key: "type", label: "Type", icon: "filter-3-line", options: ACTIVITY_TYPES },
      {
        key: "person",
        label: "Person",
        icon: "user-3-line",
        options: [...new Map(rows.filter((a) => a.actor).map((a) => [a.actorUserId, a.actor.name])).entries()].map(([value, label]) => ({ value, label })),
      },
    ],
    [rows]
  )
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((a) => {
      if (filters.type.length && !filters.type.includes(a.type)) return false
      if (filters.person.length && !filters.person.includes(a.actorUserId)) return false
      return !q || [a.summary, a.actor?.name].some((v) => v?.toLowerCase().includes(q))
    })
  }, [rows, filters, search])

  const columns = [
    {
      key: "what",
      header: "Activity",
      cell: (a) => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
            <Icon name={TYPE[a.type]?.icon ?? "history-line"} />
          </span>
          <span className="min-w-0">
            <span className="block">
              {a.actor?.code ? (
                <Link href={memberHref(a.actor.code)} className="font-medium hover:text-primary">
                  {a.actor.name}
                </Link>
              ) : a.actor ? (
                <span className="font-medium">{a.actor.name}</span>
              ) : (
                "Someone"
              )}{" "}
              {a.summary}
            </span>
            <span className="text-xs text-muted-foreground">{TYPE[a.type]?.label}</span>
          </span>
        </div>
      ),
    },
    { key: "who", header: "Person", sortValue: (a) => a.actor?.name ?? "", cell: (a) => (a.actor ? <Avatar name={a.actor.name} source={a.actor.avatarUrl} size="sm" /> : null) },
    {
      key: "when",
      header: "When",
      className: "whitespace-nowrap",
      sortValue: (a) => new Date(a.createdAt).getTime(),
      cell: (a) => (
        <div>
          <span className="block">{timeAgo(a.createdAt)}</span>
          <span className="block text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Activity Log"
          description={`${visible.length} ${visible.length === 1 ? "event" : "events"}`}
          toolbar={
            <>
              <div className="min-w-32 flex-1 sm:max-w-80">
                <Input type="search" placeholder="Search activity…" aria-label="Search activity" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={visible}
          minWidth="44rem"
          defaultSort={{ key: "when", dir: "desc" }}
          empty={
            <>
              <Icon name="history-line" className="text-3xl text-muted-foreground" />
              <p className="mt-2 font-medium">No activity yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Sign-ins, invitations, role changes and team updates show up here.</p>
            </>
          }
        />
      </div>
    </div>
  )
}
