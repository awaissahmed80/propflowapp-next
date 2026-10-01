"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { INVOICE_STATUSES, TENANT_STATUSES, byValue } from "../statuses"

const TENANT = byValue(TENANT_STATUSES)
const INVOICE = byValue(INVOICE_STATUSES)

export function AccountStatus({ status, trialDaysLeft }) {
  const s = TENANT[status] ?? { color: "gray", label: status }
  return (
    <Badge color={s.color} dot>
      {status === "trial" && trialDaysLeft != null ? (trialDaysLeft >= 0 ? `Trial · ${trialDaysLeft}d left` : "Trial ended") : s.label}
    </Badge>
  )
}

export function InvoiceStatus({ status }) {
  const s = INVOICE[status] ?? { color: "gray", label: status }
  return (
    <Badge color={s.color} dot>
      {s.label}
    </Badge>
  )
}

export function StatusBadge({ list, value }) {
  const s = byValue(list)[value] ?? { color: "gray", label: value }
  return (
    <Badge color={s.color} dot>
      {s.label}
    </Badge>
  )
}

export function ViewAll({ href, children = "View all" }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

export function Notice({ children, tone = "success" }) {
  const tones = {
    success: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    error: "bg-red-500/10 text-red-800 dark:text-red-300",
  }
  return (
    <p role="status" className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>
      <Icon name={tone === "error" ? "error-warning-line" : "checkbox-circle-line"} /> {children}
    </p>
  )
}

// Empty list that explains itself
export function EmptyState({ icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-xl text-muted-foreground">
        <Icon name={icon} />
      </span>
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}
