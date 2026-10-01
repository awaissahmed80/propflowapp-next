"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { PRIORITIES, REQUEST_CATEGORIES, REQUEST_STATUSES, byValue } from "../statuses"
import { EmptyState, StatusBadge } from "./parts"
import { urlCode } from "@/lib/url"

const CATEGORY = byValue(REQUEST_CATEGORIES)

export function RequestsTable({ list }) {
  const router = useRouter()
  const [filters, setFilters] = useState({ status: ["open", "in_progress", "waiting"], category: [], priority: [] })
  const groups = [
    { key: "status", label: "Status", icon: "flag-line", options: REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: "category", label: "Type", icon: "price-tag-3-line", options: REQUEST_CATEGORIES.map((t) => ({ value: t.value, label: t.label })) },
    { key: "priority", label: "Urgency", icon: "alarm-warning-line", options: PRIORITIES },
  ]
  const visible = list.filter(
    (r) =>
      (!filters.status.length || filters.status.includes(r.status)) &&
      (!filters.category.length || filters.category.includes(r.category)) &&
      (!filters.priority.length || filters.priority.includes(r.priority))
  )
  const columns = [
    {
      key: "subject",
      header: "Request",
      sortValue: (r) => r.subject,
      cell: (r) => (
        <div className="flex min-w-0 items-start gap-3">
          <Icon name={CATEGORY[r.category]?.icon ?? "question-line"} className="mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <span className="flex items-center gap-2 truncate font-medium group-hover:text-primary">
              {r.subject}
              {r.priority === "urgent" && <Badge color="red">Urgent</Badge>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {r.code} · {CATEGORY[r.category]?.label ?? r.category}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "workspace",
      header: "Workspace",
      sortValue: (r) => r.tenantName,
      cell: (r) => (
        <span>
          {r.tenantName}
          <span className="block text-xs text-muted-foreground">{r.raisedByUser?.name ?? "—"}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge list={REQUEST_STATUSES} value={r.status} /> },
    { key: "updated", header: "Last activity", className: "whitespace-nowrap text-muted-foreground", sortValue: (r) => r.updatedAt ?? r.createdAt, cell: (r) => timeAgo(r.updatedAt ?? r.createdAt) },
  ]
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Workspace Requests" description="Problems, feature requests and questions sent from the portal" toolbar={list.length ? <FilterMenu groups={groups} value={filters} onChange={setFilters} /> : null} />
      {list.length ? (
        <>
          <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
          <div className="min-h-0 flex-1">
            <DataTable columns={columns} rows={visible} minWidth="50rem" onRowClick={(r) => router.push(`/requests/${urlCode(r.code)}`)} empty="Nothing here. Nice." />
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-background">
          <EmptyState icon="question-answer-line" title="No requests yet">
            Workspaces send problems, questions and feature requests from Help & feedback in the portal.
          </EmptyState>
        </div>
      )}
    </div>
  )
}
