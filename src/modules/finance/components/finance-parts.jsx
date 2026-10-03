"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { PERIODS, VOUCHER_SOURCES, VOUCHER_STATUS, VOUCHER_TYPES, figure } from "../constants"

// Shared bits of Finance's books screens: voucher badges, where a voucher came from, money figures
// and the New voucher menu.

const TYPE_COLOR = { jv: "violet", crv: "green", brv: "teal", cpv: "amber", bpv: "sky" }

// CRV, BPV… as a small badge; the full name on hover
export function VoucherTypeBadge({ type, className }) {
  const t = VOUCHER_TYPES[type]
  return (
    <Badge color={TYPE_COLOR[type] ?? "gray"} className={cn("font-mono", className)} title={t?.label}>
      {t?.short ?? String(type ?? "").toUpperCase()}
    </Badge>
  )
}

// Only shown when it isn't simply posted (unless always)
export function VoucherStatusBadge({ status, always = false }) {
  const s = VOUCHER_STATUS[status]
  if (!s || (status === "posted" && !always)) return null
  return (
    <Badge color={s.color} dot>
      {s.label}
    </Badge>
  )
}

// Where a voucher came from (another app), linking back to the record
export function SourceLink({ voucher: v, className }) {
  const s = VOUCHER_SOURCES[v.source]
  if (!s || v.source === "manual") return null
  const body = (
    <>
      <Icon name={s.icon} /> {s.label}
      {v.sourceCode ? ` ${v.sourceCode}` : ""}
    </>
  )
  return v.link ? (
    <Link href={v.link} className={cn("inline-flex items-center gap-1 text-xs text-primary hover:underline", className)} onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  ) : (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>{body}</span>
  )
}

// Rs 1,234,567 (paisa when there are any)
export const rupees = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(Number(n) || 0)}`

// An amount on screen: Rs with tabular figures; negative in red
export function Money({ value, className }) {
  const v = Number(value) || 0
  return <span className={cn("tabular-nums", v < 0 && "text-red-600 dark:text-red-400", className)}>{v < 0 ? `(${rupees(-v)})` : rupees(v)}</span>
}

// Accounting figure: (1,234) for negatives; blank for zero unless zero="0"
export function Figure({ value, zero = "", className }) {
  const s = figure(value)
  return <span className={cn("tabular-nums", Number(value) < 0 && "text-red-600 dark:text-red-400", className)}>{s || zero}</span>
}

export function PeriodSelect({ value, onChange, className }) {
  return <Select aria-label="Period" className={className} value={value} onChange={onChange} options={PERIODS} />
}

export const NEW_VOUCHER_KINDS = [
  { kind: "payment", label: "Payment", icon: "arrow-right-up-line" },
  { kind: "receipt", label: "Receipt", icon: "arrow-left-down-line" },
  { kind: "transfer", label: "Transfer between accounts", icon: "arrow-left-right-line" },
  { kind: "journal", label: "Journal voucher", icon: "book-2-line" },
]

// "New voucher" with the four kinds → onPick(kind)
export function NewVoucherMenu({ onPick, size }) {
  return (
    <DropdownMenu
      align="end"
      items={NEW_VOUCHER_KINDS.map((k) => ({ label: k.label, icon: k.icon, onClick: () => onPick(k.kind) }))}
      trigger={
        <Button leftIcon="add-line" size={size}>
          New voucher
        </Button>
      }
    />
  )
}

// Paid to / Received from, by voucher type
export const partyLabel = (type) => (type === "cpv" || type === "bpv" ? "Paid to" : type === "crv" || type === "brv" ? "Received from" : "Party")
