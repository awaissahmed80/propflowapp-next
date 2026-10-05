"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { AccountSelect, defaultAccount } from "@/modules/finance/components/money-parts"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { ADVANCE_MAX_MONTHS, LOAN_STATUS, installmentFor } from "../constants"
import { giveLoan } from "../server/actions"
import { EmployeeCell, LoanStatusBadge, employeeHref, hrNav, monthLabel, rs } from "./people-parts"

// HR › Loans & advances: given now, recovered from salary each month through payroll.
//   loans: listLoans() · employees: employeeOptions() · accounts: cash and bank (when they can give)
//   can: { give (hr create + hr.loans) }
export function LoansView({ loans, employees, accounts, can }) {
  const router = useRouter()
  const { title } = hrNav("/hrm/loans")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ status: ["pending", "active"], kind: [] })
  const [giving, setGiving] = useState(false)
  const open = loans.filter((l) => l.status === "active")
  const leftTotal = open.reduce((s, l) => s + l.left, 0)
  const waiting = loans.filter((l) => l.status === "pending").length
  const groups = [
    { key: "status", label: "Status", icon: "flag-line", options: Object.entries(LOAN_STATUS).map(([value, s]) => ({ value, label: s.label })) },
    {
      key: "kind",
      label: "Kind",
      icon: "hand-coin-line",
      options: [
        { value: "advance", label: "Salary advance" },
        { value: "loan", label: "Loan" },
      ],
    },
  ]
  const term = q.trim().toLowerCase()
  const shown = loans.filter((l) => {
    if (filters.status.length && !filters.status.includes(l.status)) return false
    if (filters.kind.length && !filters.kind.includes(l.kind)) return false
    return !term || [l.employee.name, l.employee.code, l.code, l.reason].some((x) => x?.toLowerCase().includes(term))
  })

  const columns = [
    { key: "employee", header: "Employee", sortValue: (l) => l.employee.name.toLowerCase(), cell: (l) => <EmployeeCell employee={l.employee} /> },
    {
      key: "kind",
      header: "Kind",
      sortValue: (l) => l.kind,
      cell: (l) => (
        <span className="block max-w-56">
          {l.kind === "advance" ? "Salary advance" : "Loan"} <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
          <span className="block truncate text-xs text-muted-foreground">{l.reason || "—"}</span>
        </span>
      ),
    },
    { key: "amount", header: "Amount", className: "text-right whitespace-nowrap tabular-nums", sortValue: (l) => l.amount, cell: (l) => rs(l.amount) },
    {
      key: "installment",
      header: "A month",
      className: "text-right whitespace-nowrap tabular-nums text-muted-foreground",
      sortValue: (l) => l.installment,
      cell: (l) => (
        <span>
          {rs(l.installment)}
          <span className="block text-xs">from {monthLabel(l.startMonth)}</span>
        </span>
      ),
    },
    {
      key: "recovered",
      header: "Recovered",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (l) => l.recovered,
      cell: (l) => (l.recovered ? rs(l.recovered) : <span className="text-muted-foreground">—</span>),
    },
    { key: "left", header: "Left", className: "text-right whitespace-nowrap font-medium tabular-nums", sortValue: (l) => l.left, cell: (l) => (l.left ? rs(l.left) : <span className="text-muted-foreground">—</span>) },
    { key: "status", header: "Status", sortValue: (l) => l.status, cell: (l) => <LoanStatusBadge status={l.status} /> },
    {
      key: "given",
      header: "Given",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (l) => l.givenAt ?? "",
      cell: (l) => (
        <span>
          {l.givenAt ? formatDate(l.givenAt) : "—"}
          {l.account && <span className="block max-w-36 truncate text-xs">{l.account}</span>}
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={`${open.length} being recovered · ${rs(leftTotal)} still to come off salaries${waiting ? ` · ${waiting} waiting for approval` : ""}`}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search loans" placeholder="Name or reason…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          can.give && (
            <Button leftIcon="hand-coin-line" onClick={() => setGiving(true)}>
              Give loan or advance
            </Button>
          )
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(l) => l.code}
          minWidth="62rem"
          onRowClick={(l) => router.push(employeeHref(l.employee.code))}
          defaultSort={{ key: "given", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">{loans.length ? "Nothing matches." : "No loans or advances yet."}</p>}
        />
      </div>
      {giving && (
        <GiveLoanDialog
          employees={employees}
          accounts={accounts}
          open={new Set(loans.filter((l) => ["pending", "active"].includes(l.status)).map((l) => l.employee.code))}
          onClose={() => setGiving(false)}
          onDone={() => {
            setGiving(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// Give a loan or salary advance: paid out now from cash or bank (posted to Finance), recovered
// from salary starting next month
function GiveLoanDialog({ employees, accounts, open, onClose, onDone }) {
  const initial = useMemo(() => ({ employee: "", kind: "advance", amount: 0, months: 3, accountId: defaultAccount(accounts), reason: "" }), [accounts])
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  useUnsavedGuard(JSON.stringify(f) !== JSON.stringify(initial))
  const picked = employees.find((e) => e.code === f.employee)
  const installment = f.amount > 0 ? installmentFor(f.amount, f.months) : 0
  const maxMonths = f.kind === "advance" ? ADVANCE_MAX_MONTHS : 60
  const overGross = f.kind === "advance" && picked?.gross && f.amount > picked.gross
  const busy = picked && open.has(picked.code)

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => giveLoan(f), {
        loading: "Paying out…",
        success: (x) => `${f.kind === "advance" ? "Advance" : "Loan"} ${x.code} given to ${picked?.name}. ${rs(installment)} a month comes off salary from next month.`,
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone()
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title="Give a loan or advance"
      description="Paid out now and posted to Finance. Installments come off salary in payroll, starting next month."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="hand-coin-line" loading={pending} disabled={!f.employee || !(f.amount > 0) || busy} onClick={save}>
            Give {f.kind === "advance" ? "advance" : "loan"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Combobox
            label="Employee"
            placeholder="Search by name…"
            options={employees.map((e) => ({ value: e.code, label: e.name, description: [e.code, e.gross ? `gross ${rs(e.gross)}` : null, open.has(e.code) ? "has one open" : null].filter(Boolean).join(" · ") }))}
            value={f.employee || null}
            onChange={(v) => set({ employee: v ?? "" })}
            error={errors.employee || (busy ? `${picked.name} already has a loan or advance open.` : undefined)}
          />
        </div>
        <div className="sm:col-span-2">
          <ToggleGroup
            value={f.kind}
            onChange={(v) => set({ kind: v, months: v === "advance" ? Math.min(f.months, ADVANCE_MAX_MONTHS) : Math.max(f.months, 12) })}
            options={[
              { value: "advance", label: "Salary advance" },
              { value: "loan", label: "Loan" },
            ]}
          />
        </div>
        <NumberInput label="Amount" prefix="Rs" min={0} step={5000} format={{ maximumFractionDigits: 0 }} value={f.amount} onChange={(v) => set({ amount: v ?? 0 })} error={errors.amount} />
        <NumberInput label="Repaid over" suffix="months" min={1} max={maxMonths} value={f.months} onChange={(v) => set({ months: Math.min(maxMonths, v ?? 1) })} error={errors.months} />
        <p className="text-sm sm:col-span-2">
          {installment ? (
            <>
              <span className="font-medium tabular-nums">{rs(installment)}</span> <span className="text-muted-foreground">a month from next month&apos;s salary</span>
            </>
          ) : (
            <span className="text-muted-foreground">Enter the amount to see the monthly installment.</span>
          )}
          {overGross && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">More than one month&apos;s gross ({rs(picked.gross)}). Advances are usually up to a month&apos;s salary.</span>}
        </p>
        <div className="sm:col-span-2">
          <AccountSelect label="Paid from" accounts={accounts} value={f.accountId} onChange={(v) => set({ accountId: v })} error={errors.accountId} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Reason" rows={2} maxLength={500} placeholder="e.g. Children's school fees" value={f.reason} onChange={(e) => set({ reason: e.target.value })} error={errors.reason} />
        </div>
      </div>
    </Dialog>
  )
}
