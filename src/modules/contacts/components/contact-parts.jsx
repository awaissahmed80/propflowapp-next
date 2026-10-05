"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { vizColor } from "@/lib/chart-colors"
import { Icon } from "@/components/ui/icon"

// Small pieces shared by the Contacts pages
export { ContactTypeBadges } from "@/modules/crm/components/contact-types"

export const telHref = (phone) => `tel:${phone}`
export const waHref = (phone) => `https://wa.me/${String(phone ?? "").replace(/\D/g, "")}`

// An amber note under a page header (why a review list matters)
export function Banner({ icon = "information-line", children }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
      <Icon name={icon} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Empty({ icon, text, children }) {
  return (
    <div className="rounded-xl border border-dashed bg-background px-4 py-10 text-center text-sm text-muted-foreground">
      <Icon name={icon} className="text-2xl" />
      <p className="mt-1">{text}</p>
      {children}
    </div>
  )
}

// Horizontal bars with a label (contacts by type, by city)
//   rows: [{ key, label, icon?, color?, count, href? }]
export function BarList({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const body = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              {r.icon && <Icon name={r.icon} className="shrink-0 text-muted-foreground" />}
              <span className={cn("truncate", r.href && "group-hover:text-primary")}>{r.label}</span>
            </span>
            <span className="h-3 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color ?? vizColor("blue") }} />
            </span>
            <span className="text-right font-medium tabular-nums">{r.count}</span>
          </>
        )
        const cls = "group grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm"
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className={cls}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
