"use client"

import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { formatPkr } from "@/lib/format"
import { confirm } from "@/components/alert-context"
import { useList, useMeasures } from "@/modules/lookups/context"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"

// Small shared pieces for Sales screens

export const STAGES = ["token", "booking-kyc", "active", "handover", "completed"]

// A booking's pipeline stage or status, in its Lists & Labels color
export function StageBadge({ stage, className }) {
  const v = useList("booking-stage").map[stage]
  return (
    <Badge color={toHex(v?.color) ?? "gray"} dot className={className}>
      {v?.label ?? stage}
    </Badge>
  )
}
export function StatusBadge({ status, className }) {
  const v = useList("booking-status").map[status]
  return (
    <Badge color={toHex(v?.color) ?? "gray"} className={className}>
      {v?.label ?? status}
    </Badge>
  )
}

// A schedule line's state
const LINE = {
  paid: { label: "Paid", color: "green", icon: "checkbox-circle-line" },
  partial: { label: "Part paid", color: "blue" },
  overdue: { label: "Overdue", color: "red" },
  "due-soon": { label: "Due soon", color: "amber" },
  upcoming: { label: "Upcoming", color: "gray" },
  cancelled: { label: "Canceled", color: "gray" },
}
export function LineBadge({ line }) {
  const s = LINE[line.state] ?? LINE.upcoming
  return (
    <Badge color={s.color} className="whitespace-nowrap">
      {s.label}
      {line.state === "overdue" && line.daysLate > 0 && <span className="opacity-80"> · {line.daysLate}d</span>}
    </Badge>
  )
}

// Receipt status: cleared | clearing | bounced | cancelled
const RECEIPT = { cleared: ["Cleared", "green"], clearing: ["In clearing", "amber"], pending: ["Waiting for approval", "violet"], bounced: ["Bounced", "red"], rejected: ["Not approved", "gray"], cancelled: ["Canceled", "gray"] }
export function ReceiptBadge({ status }) {
  const [label, color] = RECEIPT[status] ?? [status, "gray"]
  return <Badge color={color}>{label}</Badge>
}

// Commission status: pending | payable | paid | void | clawback | recovered
export const COMMISSION = {
  pending: ["Waiting", "gray"],
  payable: ["Payable", "amber"],
  paid: ["Paid", "green"],
  void: ["Void", "gray"],
  clawback: ["Recover", "red"],
  recovered: ["Recovered", "blue"],
}
export function CommissionBadge({ status, className }) {
  const [label, color] = COMMISSION[status] ?? [status, "gray"]
  return (
    <Badge color={color} className={className}>
      {label}
    </Badge>
  )
}

// How much of the price is in: a thin bar (amber when something's overdue)
export function PaidMeter({ pct, overdue = false, className }) {
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-foreground/8", className)} aria-hidden>
      <span className={cn("block h-full rounded-full", overdue ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </span>
  )
}

// "5 Marla residential plot" for a unit
export function useUnitText() {
  const types = useList("unit-type")
  const m = useMeasures()
  return (u) => [u.sizeValue ? m.formatSize(Number(u.sizeValue), u.sizeUnit) : null, u.type ? types.label(u.type).toLowerCase() : null].filter(Boolean).join(" ")
}

// Payment method with its icon
export function MethodText({ method, className }) {
  const list = useList("payment-method")
  const v = list.map[method]
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon name={v?.icon ?? "money-dollar-circle-line"} className="text-muted-foreground" />
      {v?.label ?? method}
    </span>
  )
}

// Rs with the exact amount on hover
export function Money({ value, className }) {
  return (
    <Tooltip content={`Rs ${new Intl.NumberFormat("en-PK").format(Math.round(value))}`}>
      <span className={cn("tabular-nums", className)}>{formatPkr(value)}</span>
    </Tooltip>
  )
}

// Proof of payment: pick a photo or PDF of the deposit slip, cheque or transfer screenshot.
//   value: { file, url } | null; onChange(next)
export function ProofPicker({ value, onChange, error }) {
  const pick = (file) => {
    if (value?.url) URL.revokeObjectURL(value.url)
    onChange(file ? { file, url: URL.createObjectURL(file) } : null)
  }
  const isPdf = value?.file?.type === "application/pdf"
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        Proof of payment <span className="font-normal text-muted-foreground">(photo or PDF)</span>
      </p>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          {isPdf ? (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-2xl text-red-600 dark:text-red-400">
              <Icon name="file-pdf-2-line" />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file
            <img src={value.url} alt="Proof of payment" className="size-14 shrink-0 rounded-md object-cover" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{value.file.name}</span>
            <span className="block text-xs text-muted-foreground">{Math.max(1, Math.round(value.file.size / 1024))} KB</span>
          </span>
          <button
            type="button"
            onClick={() => pick(null)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove proof"
          >
            <Icon name="close-line" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-foreground/25 bg-muted/40 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground focus-within:border-primary/60">
          <Icon name="image-add-line" className="text-xl" />
          <span>
            <span className="font-medium text-foreground">Upload a photo or PDF</span>
            <span className="block text-xs">Deposit slip, cheque, or the transfer screenshot · up to 10 MB</span>
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// FormData carrying the proof for a server action, or null
export const proofForm = (proof) => {
  if (!proof?.file) return null
  const fd = new FormData()
  fd.append("proof", proof.file)
  return fd
}

// "Proof" link on a receipt that has one
export function ProofLink({ proof, className }) {
  if (!proof) return null
  return (
    <a href={proof.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cn("inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline", className)}>
      <Icon name={proof.mime === "application/pdf" ? "file-pdf-2-line" : "image-line"} /> Proof
    </a>
  )
}

// "Cheque bounced" reverses a payment, so it asks first (Collections and the booking page)
export const confirmBounce = (r) =>
  confirm({
    title: `Mark ${r.chequeNo ? `cheque ${r.chequeNo}` : r.code} as bounced?`,
    description: `The ${formatPkr(r.amount)} receipt no longer counts as paid and the installment it covered is due again.`,
    confirmLabel: "Mark bounced",
    destructive: true,
    icon: "close-circle-line",
  })
