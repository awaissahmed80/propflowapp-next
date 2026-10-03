"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Select } from "@/components/ui/select"
import { FINANCE_NAV } from "../nav"

// Small shared pieces for Finance's money-in and money-out screens (receipts, cheques, refunds,
// vendors, payment requests)

// The page's title and subtitle from the sidebar
export function financeNav(to) {
  const item = FINANCE_NAV.flatMap((g) => g.items).find((i) => i.to === to)
  return { title: item?.label ?? "", description: item?.description ?? "" }
}

// Rs 1,234,567 (whole rupees)
export const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`

// Today in Pakistan as "2026-10-03"
export const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
export const pkDayOf = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d)) : "")
export const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return pkDayOf(d)
}

const accountLabel = (a) => [a.name, a.bankName].filter(Boolean).join(" · ")

// The account preselected: the workspace default if it fits, else the first that does
//   kind: "cash" | "bank" | null (any)
export function defaultAccount(accounts, kind = null) {
  const fits = accounts.filter((a) => !kind || a.kind === kind)
  return (fits.find((a) => a.isDefault) ?? fits[0])?.id ?? null
}

// Cash and bank accounts, cash first then banks
export function AccountSelect({ accounts, value, onChange, label = "Account", error, className, kind = null }) {
  const shown = accounts.filter((a) => !kind || a.kind === kind)
  return (
    <Select
      label={label}
      className={className}
      value={value ? String(value) : ""}
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={shown.map((a) => ({ value: String(a.id), label: accountLabel(a), icon: a.kind === "cash" ? "wallet-3-line" : "bank-line" }))}
      error={error}
    />
  )
}

// A voucher code (BRV-2627-00012) as a link to it in Vouchers
export function VoucherLinks({ vouchers, className }) {
  if (!vouchers?.length) return <span className="text-muted-foreground">Not posted yet</span>
  return (
    <span className={cn("flex flex-wrap gap-x-2 gap-y-0.5", className)}>
      {vouchers.map((v) => (
        <Link
          key={v.code}
          href={`/finance/vouchers?open=${v.code.toLowerCase()}`}
          className={cn("font-mono text-[13px] text-primary hover:underline", v.status === "void" && "text-muted-foreground line-through", v.status === "pending" && "text-muted-foreground")}
          title={v.event ?? undefined}
        >
          {v.code}
        </Link>
      ))}
    </span>
  )
}

// Label-over-value fact for detail dialogs
export function Fact({ label, children, wide }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-[15px] break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}
