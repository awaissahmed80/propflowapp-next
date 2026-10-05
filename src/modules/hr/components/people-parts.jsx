"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { LEAVE_STATUS, LOAN_STATUS } from "../constants"
import { HR_NAV } from "../nav"

// Small shared pieces for HR's people screens: employees, leave and loans.

// The page's title and subtitle from the sidebar
export function hrNav(to) {
  const item = HR_NAV.flatMap((g) => g.items).find((i) => i.to === to)
  return { title: item?.label ?? "", description: item?.description ?? "" }
}

// Rs 1,234,567 (whole rupees)
export const rs = (v) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0))}`

// Today in Pakistan: "2026-10-04"
export const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())

export const employeeHref = (code) => `/hrm/employees/${urlCode(code)}`

// "2026-10" → "Oct 2026"
export const monthLabel = (m) => (m ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`)) : "")

// "4 Oct 2026" or "4 – 6 Oct 2026"
export function dateRange(start, end) {
  if (!end || start === end) return formatDate(start)
  const [a, b] = [new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`)]
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()} – ${formatDate(end)}`
  return `${formatDate(start)} – ${formatDate(end)}`
}

export const daysLabel = (d) => `${Number(d)} ${Number(d) === 1 ? "day" : "days"}`

// Avatar, name (linked to the employee) and designation
export function EmployeeCell({ employee: e, link = true, className, extra }) {
  const designations = useList("designation")
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={e.name} size="sm" />
      <span className="min-w-0">
        {link ? (
          <Link href={employeeHref(e.code)} className="block truncate font-medium hover:text-primary" onClick={(ev) => ev.stopPropagation()}>
            {e.name}
          </Link>
        ) : (
          <span className="block truncate font-medium">{e.name}</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">{extra ?? (designations.label(e.designation) || "—")}</span>
      </span>
    </span>
  )
}

export function LeaveTypeBadge({ type }) {
  const types = useList("leave-type")
  return <Badge color={types.map[type]?.color ?? "gray"}>{types.label(type)}</Badge>
}

export function LeaveStatusBadge({ status }) {
  const s = LEAVE_STATUS[status] ?? { label: status, color: "gray" }
  return (
    <Badge color={s.color} dot>
      {s.label}
    </Badge>
  )
}

export function LoanStatusBadge({ status }) {
  const s = LOAN_STATUS[status] ?? { label: status, color: "gray" }
  return (
    <Badge color={s.color} dot>
      {s.label}
    </Badge>
  )
}

// Used / allowance bar for one leave type (unpaid: just the days taken)
export function LeaveBalance({ balance: b }) {
  const types = useList("leave-type")
  const label = types.label(b.type)
  if (b.allowance == null)
    return (
      <div>
        <p className="flex justify-between gap-2 text-sm">
          <span>{label}</span>
          <span className="text-muted-foreground tabular-nums">{b.used ? `${daysLabel(b.used)} taken` : "None taken"}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">No allowance; a day&apos;s pay is deducted for each day.</p>
      </div>
    )
  const pct = Math.min(100, (b.used / (b.allowance || 1)) * 100)
  return (
    <div>
      <p className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {b.left} of {b.allowance} left
        </span>
      </p>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", b.left <= 0 ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

// Right-arrow "more" link for card headers
export function MoreLink({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}
