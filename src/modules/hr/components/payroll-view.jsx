"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { refreshDraft } from "../server/actions"
import { monthLabel } from "../payslip-parts"
import { RunStatusBadge, thisMonth } from "./payroll-parts"

// HR › Payroll: one run a month (draft → approved → paid).
//   runs: listRuns() · amounts: hr.salaries · manage: hr.payroll (start and change drafts)
export function PayrollView({ runs, title, description, amounts, manage }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const month = thisMonth()
  const current = runs.find((r) => r.month === month)
  const money = (v) => (amounts ? formatPkr(v) : "—")

  const start = () =>
    startTransition(async () => {
      const r = await toastAction(() => refreshDraft(month), { loading: "Working out the draft…", success: `${monthLabel(month)} draft ready.` })
      if (r?.ok) router.push(`/hrm/payroll/${urlCode(r.code)}`)
    })

  const columns = [
    {
      key: "month",
      header: "Month",
      sortValue: (r) => r.month,
      cell: (r) => (
        <span className="min-w-0">
          <span className="block font-medium">{monthLabel(r.month)}</span>
          <span className="block text-xs text-muted-foreground">{r.code}</span>
        </span>
      ),
    },
    { key: "people", header: "People", className: "text-right tabular-nums", sortValue: (r) => r.people, cell: (r) => r.people },
    { key: "gross", header: "Gross", className: "text-right tabular-nums whitespace-nowrap", sortValue: (r) => r.gross, cell: (r) => money(r.gross) },
    { key: "deductions", header: "Deductions", className: "text-right tabular-nums whitespace-nowrap text-muted-foreground", sortValue: (r) => r.deductions, cell: (r) => money(r.deductions) },
    { key: "net", header: "Net pay", className: "text-right font-medium tabular-nums whitespace-nowrap", sortValue: (r) => r.net, cell: (r) => money(r.net) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <RunStatusBadge status={r.status} pending={r.pending} /> },
    { key: "paid", header: "Paid", className: "whitespace-nowrap text-muted-foreground", sortValue: (r) => r.paidAt ?? "", cell: (r) => (r.paidAt ? formatDate(r.paidAt) : "—") },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          manage &&
          !current && (
            <Button leftIcon="add-line" loading={pending} onClick={start}>
              Start this month&apos;s draft
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={runs}
          rowKey={(r) => r.code}
          minWidth="48rem"
          defaultSort={{ key: "month", dir: "desc" }}
          onRowClick={(r) => router.push(`/hrm/payroll/${urlCode(r.code)}`)}
          empty={manage ? "No payroll yet. Start this month's draft: it's worked out from salaries, leave, attendance and loans." : "No payroll yet."}
        />
      </div>
    </div>
  )
}
