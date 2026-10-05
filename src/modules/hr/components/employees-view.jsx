"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, tenure } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { addFromMembers } from "../server/employee-actions"
import { EmployeeDialog } from "./employee-dialog"
import { EmployeeCell, employeeHref, hrNav, rs } from "./people-parts"

// HR › Employees: everyone on the payroll this person may see.
//   data: listEmployees() · can: { create, pay (hr.salaries) }
export function EmployeesView({ data, can }) {
  const router = useRouter()
  const { title } = hrNav("/hrm/employees")
  const departments = useList("department")
  const designations = useList("designation")
  const employmentTypes = useList("employment-type")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ department: [], designation: [], status: ["active"], type: [], project: [] })
  const [adding, setAdding] = useState(false)
  const [, startTransition] = useTransition()
  const { employees, teams, projects } = data

  const used = (key) => new Set(employees.map((e) => e[key]).filter(Boolean))
  const groups = [
    { key: "department", label: "Department", icon: "building-2-line", options: departments.options.filter((o) => used("department").has(o.value)) },
    { key: "designation", label: "Designation", icon: "briefcase-line", options: designations.options.filter((o) => used("designation").has(o.value)) },
    {
      key: "status",
      label: "Status",
      icon: "flag-line",
      options: [
        { value: "active", label: "Working" },
        { value: "left", label: "Left" },
      ],
    },
    { key: "type", label: "Employment", icon: "contract-line", options: employmentTypes.options },
    { key: "project", label: "Based at", icon: "community-line", options: [{ value: "head-office", label: "Head office" }, ...projects.map((p) => ({ value: p.code, label: p.name }))] },
  ]
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, "")
    return employees.filter((e) => {
      if (filters.department.length && !filters.department.includes(e.department)) return false
      if (filters.designation.length && !filters.designation.includes(e.designation)) return false
      if (filters.status.length && !filters.status.includes(e.status)) return false
      if (filters.type.length && !filters.type.includes(e.employmentType)) return false
      if (filters.project.length && !filters.project.includes(e.project?.code ?? "head-office")) return false
      if (!term) return true
      if ([e.name, e.code].some((x) => x?.toLowerCase().includes(term))) return true
      // CNIC and mobile match on digits, however they're typed
      return digits.length >= 3 && [e.cnic, e.phone, formatPkPhone(e.phone)].some((x) => x?.replace(/\D/g, "").includes(digits))
    })
  }, [employees, q, filters])
  const active = employees.filter((e) => e.status === "active")
  const payroll = active.reduce((s, e) => s + (e.gross ?? 0), 0)
  const missing = active.filter((e) => !e.hasLogin).length

  const fromMembers = async () => {
    const ok = await confirm({
      title: "Add everyone in Users & Teams?",
      description: "Each workspace member who isn't on the payroll yet gets an employee record with their name, mobile, designation, department, team and joining date. Dealers are left out. Fill in pay afterwards.",
      confirmLabel: "Add them",
      icon: "user-add-line",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => addFromMembers(), { loading: "Adding…", success: (x) => (x.added ? `${x.added} ${x.added === 1 ? "person" : "people"} added.` : "Everyone is already on the payroll.") })
      if (r?.ok) router.refresh()
    })
  }

  const columns = [
    {
      key: "name",
      header: "Employee",
      sortValue: (e) => e.name.toLowerCase(),
      cell: (e) => (
        <span className="flex items-center gap-2">
          <EmployeeCell employee={e} />
          {!e.hasLogin && <Icon name="user-forbid-line" className="shrink-0 text-muted-foreground" title="No portal login" aria-label="No portal login" />}
          {e.isMe && <Badge color="blue">You</Badge>}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortValue: (e) => departments.label(e.department) ?? "",
      cell: (e) => (
        <span className="block max-w-48 truncate">
          {departments.label(e.department) || "—"}
          {e.team && <span className="block truncate text-xs text-muted-foreground">{e.team.name}</span>}
        </span>
      ),
    },
    { key: "project", header: "Based at", sortValue: (e) => e.project?.name ?? "", cell: (e) => <span className="block max-w-40 truncate text-muted-foreground">{e.project?.name ?? "Head office"}</span> },
    {
      key: "type",
      header: "Employment",
      sortValue: (e) => e.employmentType,
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {employmentTypes.label(e.employmentType)}
          {e.onLeave && <Badge color="sky">On leave</Badge>}
          {e.status === "left" && <Badge color="gray">Left {formatDate(e.leftOn)}</Badge>}
        </span>
      ),
    },
    { key: "joined", header: "Joined", className: "whitespace-nowrap", sortValue: (e) => e.joinedOn, cell: (e) => <span title={formatDate(e.joinedOn)}>{tenure(e.joinedOn)}</span> },
    ...(can.pay
      ? [
          {
            key: "gross",
            header: "Gross a month",
            className: "text-right whitespace-nowrap tabular-nums",
            sortValue: (e) => e.gross ?? 0,
            cell: (e) => (e.gross ? rs(e.gross) : <span className="text-muted-foreground">Not set</span>),
          },
        ]
      : []),
    { key: "phone", header: "Mobile", className: "whitespace-nowrap text-muted-foreground tabular-nums", sortValue: (e) => e.phone ?? "", cell: (e) => (e.phone ? formatPkPhone(e.phone) : "—") },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={`${active.length} working${can.pay ? ` · ${rs(payroll)} a month in gross salaries` : ""}${missing ? ` · ${missing} without a portal login` : ""}`}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search employees" placeholder="Name, CNIC or mobile…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          can.create && (
            <>
              <DropdownMenu
                align="end"
                items={[{ label: "Add everyone in Users & Teams", icon: "team-line", onClick: fromMembers }]}
                trigger={<IconButton icon="more-2-line" variant="outline" aria-label="More" tooltip={false} />}
              />
              <Button leftIcon="user-add-line" onClick={() => setAdding(true)}>
                New employee
              </Button>
            </>
          )
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(e) => e.code}
          minWidth="60rem"
          onRowClick={(e) => router.push(employeeHref(e.code))}
          defaultSort={{ key: "name", dir: "asc" }}
          empty={
            employees.length ? (
              <p className="text-sm text-muted-foreground">No employee matches.</p>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">No employees yet. Add them one by one, or everyone in Users & Teams at once.</p>
                {can.create && (
                  <Button variant="outline" leftIcon="team-line" onClick={fromMembers}>
                    Add everyone in Users & Teams
                  </Button>
                )}
              </div>
            )
          }
        />
      </div>
      {adding && (
        <EmployeeDialog
          employee={null}
          teams={teams}
          projects={projects}
          canPay={can.pay}
          onClose={() => setAdding(false)}
          onSaved={(r) => {
            setAdding(false)
            router.push(employeeHref(r.code))
          }}
        />
      )}
    </div>
  )
}
