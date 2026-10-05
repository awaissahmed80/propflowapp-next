"use client"

import Link from "next/link"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { vizColor } from "@/lib/chart-colors"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { BarChart } from "@/components/ui/chart"
import { Icon } from "@/components/ui/icon"
import { RunStatusBadge } from "./payroll-parts"
import { EmployeeCell, LeaveTypeBadge, MoreLink, hrNav } from "./people-parts"

const axisPkr = (n) => formatPkr(n).replace(/^Rs /, "")

// HR home. data: hrOverview() · can: { leave (feature), approveLeave }
export function HrOverview({ data, can }) {
  const { description } = hrNav("/hrm")
  const departments = useList("department")
  const p = data.payroll
  const byDepartment = data.departments.map((d) => ({ label: departments.label(d.department) || "No department", count: d.count }))
  const hasCost = p?.months.some((m) => m.pay)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="HR & Payroll"
        description={description}
        actions={
          <Button variant="outline" leftIcon="team-line" nativeButton={false} render={<Link href="/hrm/employees" />}>
            Employees
          </Button>
        }
      />

      {can.leave && can.approveLeave && data.waiting > 0 && (
        <Link href="/hrm/leave" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 hover:bg-amber-500/15 dark:text-amber-200">
          <Icon name="time-line" />
          <span className="flex-1">
            {data.waiting} leave {data.waiting === 1 ? "request is" : "requests are"} waiting for approval
          </span>
          <Icon name="arrow-right-s-line" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="team-line" label="Employees" value={data.active} hint={`${data.joined} joined in 90 days · ${data.probation} on probation`} />
        {can.leave && (
          <StatTile
            icon="calendar-check-line"
            tone="sky"
            label="On leave today"
            value={data.away.length}
            hint={data.waiting ? `${data.waiting} ${data.waiting === 1 ? "request" : "requests"} waiting` : "No requests waiting"}
          />
        )}
        {p ? (
          <>
            <Link href={p.run ? `/hrm/payroll/${urlCode(p.run.code)}` : "/hrm/payroll"} className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <StatTile
                icon="money-rupee-circle-line"
                tone="green"
                label={p.run ? `Payroll · ${p.run.label}` : "Payroll"}
                value={p.run ? formatPkr(p.run.net) : "Not started"}
                hint={p.run ? `${p.run.people} people · net to pay` : "Start this month's run"}
                className="h-full transition-colors hover:bg-muted/40"
              />
            </Link>
            <StatTile
              icon="government-line"
              tone="violet"
              label={p.lastPaid ? `Tax withheld · ${p.lastPaid.label}` : "Tax withheld"}
              value={p.lastPaid ? formatPkr(p.lastPaid.tax) : "—"}
              hint={p.lastPaid ? `EOBI ${formatPkr(p.lastPaid.eobi)} (employee and employer)` : "No payroll paid yet"}
            />
          </>
        ) : (
          <StatTile icon="user-add-line" tone="green" label="Joined in 90 days" value={data.joined} className={can.leave ? "" : "col-span-2"} />
        )}
      </div>

      {p?.run && p.run.status !== "paid" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-4 shadow-xs">
          <Icon name="calendar-check-line" className="text-xl text-primary" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-medium">
              {p.run.label} payroll <RunStatusBadge status={p.run.status} />
            </span>
            <span className="text-sm text-muted-foreground">
              {formatPkr(p.run.gross)} gross · {formatPkr(p.run.net)} to pay · {p.run.people} people
            </span>
          </span>
          <Button nativeButton={false} render={<Link href={`/hrm/payroll/${urlCode(p.run.code)}`} />}>
            Review payroll
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {p && (
          <SectionCard title="Payroll cost, last 6 months" className="lg:col-span-2" action={<MoreLink href="/hrm/payroll">Payroll</MoreLink>}>
            {hasCost ? (
              <>
                <BarChart
                  data={p.months}
                  xKey="month"
                  stacked
                  valueFormatter={formatPkr}
                  axisFormatter={axisPkr}
                  series={[
                    { key: "pay", label: "Salaries (gross)", color: vizColor("violet") },
                    { key: "employer", label: "Employer EOBI & PF", color: vizColor("amber") },
                  ]}
                  style={{ height: 240 }}
                />
                <p className="mt-2 text-xs text-muted-foreground">Paid runs only. Gross includes bonuses and overtime.</p>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No payroll paid in the last six months.</p>
            )}
          </SectionCard>
        )}
        <SectionCard title="People by department" className={p ? "" : "lg:col-span-2"}>
          {byDepartment.length ? (
            <BarChart
              data={byDepartment}
              xKey="label"
              horizontal
              categoryWidth={130}
              showLegend={false}
              series={[{ key: "count", label: "People", color: vizColor("blue") }]}
              style={{ height: Math.max(160, byDepartment.length * 32 + 40) }}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No employees yet.</p>
          )}
        </SectionCard>
        {can.leave && (
          <SectionCard title="Away today" action={<MoreLink href="/hrm/leave">Leave</MoreLink>} className={p ? "lg:col-span-3" : ""}>
            {data.away.length ? (
              <ul className={p ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
                {data.away.map((e) => (
                  <li key={e.code} className="flex items-center justify-between gap-2">
                    <EmployeeCell employee={e} extra={`Back ${formatDate(e.backOn)}`} />
                    <LeaveTypeBadge type={e.leaveType} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Everyone is in today.</p>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  )
}
