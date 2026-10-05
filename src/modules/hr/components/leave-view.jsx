"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { LEAVE_STATUS } from "../constants"
import { cancelLeave, decideLeave } from "../server/actions"
import { ApplyLeaveDialog, RejectLeaveDialog } from "./leave-dialogs"
import { EmployeeCell, LeaveStatusBadge, LeaveTypeBadge, dateRange, daysLabel, hrNav, pkToday } from "./people-parts"

// HR › Leave: requests waiting, who's away now and soon, and everything.
//   leave: listLeave() · employees / balances: who leave can be applied for here
//   can: { pickOthers (hr create), approve (hr.approve-leave) }
export function LeaveView({ leave, employees, balances, can }) {
  const router = useRouter()
  const { title, description } = hrNav("/hrm/leave")
  const types = useList("leave-type")
  const [view, setView] = useState(() => (leave.some((l) => l.status === "pending") ? "waiting" : "away"))
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ type: [], status: [] })
  const [dialog, setDialog] = useState(null) // "apply" | { reject: leave }
  const [busy, setBusy] = useState(null)
  const [, startTransition] = useTransition()
  const today = pkToday()

  const waiting = leave.filter((l) => l.status === "pending")
  const away = leave.filter((l) => l.status === "approved" && l.endOn >= today)
  const groups = [
    { key: "type", label: "Type", icon: "price-tag-3-line", options: types.options },
    ...(view === "all" ? [{ key: "status", label: "Status", icon: "flag-line", options: Object.entries(LEAVE_STATUS).map(([value, s]) => ({ value, label: s.label })) }] : []),
  ]
  const rows = useMemo(() => {
    const base = view === "waiting" ? waiting : view === "away" ? away : leave
    const term = q.trim().toLowerCase()
    return base.filter((l) => {
      if (filters.type.length && !filters.type.includes(l.type)) return false
      if (view === "all" && filters.status.length && !filters.status.includes(l.status)) return false
      return !term || [l.employee.name, l.employee.code, l.code, l.reason].some((x) => x?.toLowerCase().includes(term))
    })
  }, [view, waiting, away, leave, q, filters])

  const approve = (l) =>
    startTransition(async () => {
      setBusy(l.code)
      const r = await toastAction(() => decideLeave(l.code, "approved"), { loading: "Approving…", success: `${l.employee.name}'s leave approved.` })
      setBusy(null)
      if (r?.ok) router.refresh()
    })
  const cancel = async (l) => {
    const ok = await confirm({
      title: l.employee.isMe ? "Withdraw your leave request?" : `Cancel ${l.employee.name}'s leave?`,
      description: `${dateRange(l.startOn, l.endOn)}, ${daysLabel(l.days)}. ${l.status === "pending" ? "The request leaves Approvals." : "The days go back to their balance."}`,
      confirmLabel: l.employee.isMe && l.status === "pending" ? "Withdraw" : "Cancel leave",
      cancelLabel: "Keep it",
      destructive: true,
      icon: "close-circle-line",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => cancelLeave(l.code), { loading: "Canceling…", success: "Leave canceled." })
      if (r?.ok) router.refresh()
    })
  }

  const columns = [
    { key: "employee", header: "Employee", sortValue: (l) => l.employee.name.toLowerCase(), cell: (l) => <EmployeeCell employee={l.employee} /> },
    { key: "type", header: "Type", sortValue: (l) => types.label(l.type), cell: (l) => <LeaveTypeBadge type={l.type} /> },
    {
      key: "dates",
      header: "Dates",
      className: "whitespace-nowrap",
      sortValue: (l) => l.startOn,
      cell: (l) => (
        <span>
          {dateRange(l.startOn, l.endOn)}
          <span className="block text-xs text-muted-foreground">
            {daysLabel(l.days)}
            {l.status === "approved" && l.startOn <= today && l.endOn >= today ? " · away now" : ""}
          </span>
        </span>
      ),
    },
    { key: "reason", header: "Reason", cell: (l) => <span className="line-clamp-2 max-w-72 text-sm">{l.reason || <span className="text-muted-foreground">—</span>}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (l) => l.status,
      cell: (l) => (
        <span className="flex flex-col items-start gap-0.5">
          <LeaveStatusBadge status={l.status} />
          <span className="max-w-48 truncate text-xs text-muted-foreground" title={l.decisionNote ?? undefined}>
            {l.decidedBy ? `by ${l.decidedBy}${l.decisionNote ? `: ${l.decisionNote}` : ""}` : `applied ${formatDate(l.appliedAt)}`}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (l) => (
        <span className="flex justify-end gap-1">
          {l.canDecide && (
            <>
              <Button size="sm" variant="outline" leftIcon="check-line" loading={busy === l.code} onClick={() => approve(l)}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog({ reject: l })}>
                Reject
              </Button>
            </>
          )}
          {l.canCancel && !l.canDecide && (
            <Button size="sm" variant="ghost" onClick={() => cancel(l)}>
              {l.employee.isMe && l.status === "pending" ? "Withdraw" : "Cancel"}
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <ToggleGroup
              value={view}
              onChange={setView}
              options={[
                { value: "waiting", label: waiting.length ? `Waiting (${waiting.length})` : "Waiting" },
                { value: "away", label: away.length ? `Away now & upcoming (${away.length})` : "Away now & upcoming" },
                { value: "all", label: "All" },
              ]}
            />
            <div className="min-w-32 flex-1 sm:max-w-60">
              <Input type="search" aria-label="Search leave" placeholder="Name or reason…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          employees.length > 0 && (
            <Button leftIcon="calendar-check-line" onClick={() => setDialog("apply")}>
              Apply for leave
            </Button>
          )
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          key={view}
          columns={columns}
          rows={rows}
          rowKey={(l) => l.code}
          minWidth="60rem"
          defaultSort={view === "all" ? { key: "dates", dir: "desc" } : { key: "dates", dir: "asc" }}
          empty={<p className="text-sm text-muted-foreground">{view === "waiting" ? "No requests waiting." : view === "away" ? "Nobody is away or going on leave." : "No leave yet."}</p>}
        />
      </div>
      {dialog === "apply" && (
        <ApplyLeaveDialog
          employees={employees}
          balances={balances}
          canPickOthers={can.pickOthers}
          approver={can.approve}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null)
            if (!r.approved) setView("waiting")
            router.refresh()
          }}
        />
      )}
      {dialog?.reject && (
        <RejectLeaveDialog
          leave={dialog.reject}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
