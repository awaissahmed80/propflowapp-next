"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { TenantMark } from "@/components/tenant-mark"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { TENANT_STATUSES } from "../statuses"
import { AccountStatus, EmptyState } from "./parts"
import { InviteWorkspaceButton, PendingWorkspaceInvites } from "./workspace-invites"
import { urlCode } from "@/lib/url"

// invite: { plans, defaults } when the person may invite workspaces, else null
export function WorkspacesTable({ rows, plans, initialStatus, invites, invite }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ status: initialStatus ? [initialStatus] : [], plan: [] })

  const groups = [
    { key: "status", label: "Status", icon: "flag-line", options: TENANT_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: "plan", label: "Plan", icon: "vip-crown-line", options: plans.map((p) => ({ value: String(p.id), label: p.name })) },
  ]
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (t) =>
        (!filters.status.length || filters.status.includes(t.status)) &&
        (!filters.plan.length || filters.plan.includes(String(t.planId))) &&
        (!q || [t.name, t.slug, t.city, t.owner?.name, t.owner?.email, t.code].some((v) => v?.toLowerCase().includes(q)))
    )
  }, [rows, filters, search])

  const columns = [
    {
      key: "name",
      header: "Workspace",
      sortValue: (t) => t.name.toLowerCase(),
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <TenantMark tenant={t} className="size-9 rounded-lg text-xs" />
          <div className="min-w-0">
            <Link href={`/workspaces/${urlCode(t.code)}`} className="block truncate font-medium group-hover:text-primary">
              {t.name}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">
              {t.code} · {t.city ?? "—"} · {t.owner?.email ?? t.slug}
            </span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (t) => t.status, cell: (t) => <AccountStatus status={t.status} trialDaysLeft={t.trialDaysLeft} /> },
    {
      key: "plan",
      header: "Plan",
      sortValue: (t) => t.planId,
      cell: (t) => (
        <span>
          {t.planName}
          <span className="block text-xs text-muted-foreground">{t.billingCycle}</span>
        </span>
      ),
    },
    {
      key: "users",
      header: "Users",
      className: "text-right tabular-nums",
      sortValue: (t) => t.users,
      cell: (t) => (
        <span>
          {t.users}
          <span className="text-xs text-muted-foreground">{t.maxUsers ? ` / ${t.maxUsers}` : ""}</span>
        </span>
      ),
    },
    { key: "mrr", header: "MRR", className: "text-right tabular-nums whitespace-nowrap", sortValue: (t) => t.mrr, cell: (t) => (t.mrr ? formatPkr(t.mrr) : <span className="text-muted-foreground">—</span>) },
    { key: "created", header: "Joined", className: "whitespace-nowrap text-muted-foreground", sortValue: (t) => t.createdAt, cell: (t) => formatDate(t.createdAt) },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Workspaces"
        description={`${rows.length} customer workspace${rows.length === 1 ? "" : "s"}`}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-80">
              <Input type="search" placeholder="Company, owner, city or code…" aria-label="Search workspaces" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={invite && <InviteWorkspaceButton plans={invite.plans} defaults={invite.defaults} apps={invite.apps} />}
      />
      <PendingWorkspaceInvites invites={invites} manage={Boolean(invite)} />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        {rows.length ? (
          <DataTable columns={columns} rows={visible} minWidth="60rem" onRowClick={(t) => router.push(`/workspaces/${urlCode(t.code)}`)} empty="No workspaces match." />
        ) : (
          <div className="rounded-xl border bg-background">
            <EmptyState icon="building-4-line" title="No workspaces yet">
              Companies appear here once they set up their workspace. Use Invite workspace to send someone a setup link with a plan you choose.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
