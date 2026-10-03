"use client"

import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatPkr, timeAgo } from "@/lib/format"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { LineBadge, MethodText } from "./sales-parts"

// A booking's Overview tab: the details card (buyer, unit, price, sold by; `details`, from the
// page) beside three small panels: what's due, documents still needed, and the dates it passed.
//   onTab(value): jump to another tab · onReceipt(receipt): open a receipt's print preview

const GATES = ["allotment", "handover", "possession"]

function Panel({ title, action, children }) {
  return (
    <section className="rounded-xl border bg-background shadow-xs">
      <div className="flex h-10 items-center justify-between border-b px-4">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function More({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </button>
  )
}

export function BookingOverview({ booking: b, details, onTab, onReceipt }) {
  const last = [...b.receipts].sort((x, y) => new Date(y.receivedOn) - new Date(x.receivedOn)).find((r) => r.status !== "cancelled")
  const clearing = b.receipts.filter((r) => r.status === "clearing")
  const due = b.lines.filter((l) => l.balance > 0).slice(0, 3)

  const required = b.documents.checklist.filter((c) => c.required)
  const missing = required.filter((c) => !c.files.length)
  const nextGate = GATES.find((g) => missing.some((c) => c.gate === g))

  const dates = [
    { label: "Booked", at: b.bookedAt },
    { label: "KYC", at: b.kycAt },
    { label: "Allotted", at: b.allotment?.at },
    { label: "Handover", at: b.handoverAt },
    { label: "Possession", at: b.completedAt },
  ]

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {details}

      <div className="space-y-4">
        <Panel title="Payments" action={b.lines.length > 0 && <More onClick={() => onTab("schedule")}>Schedule</More>}>
          {!b.lines.length ? (
            <p className="text-[15px] text-muted-foreground">No payment plan yet.</p>
          ) : due.length ? (
            <ul className="-my-1 divide-y">
              {due.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2 text-[15px]">
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <span className="text-[13px] text-muted-foreground tabular-nums">{formatDate(l.dueDate)}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatPkr(l.balance)}</span>
                  <LineBadge line={l} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <Icon name="checkbox-circle-line" /> Paid in full
            </p>
          )}
          {(last || clearing.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-[13px] text-muted-foreground">
              {last && (
                <span className="flex items-center gap-1">
                  Last paid <span className="font-medium text-foreground tabular-nums">{formatPkr(last.amount)}</span>
                  <MethodText method={last.method} />
                  <Tooltip content={formatDateTime(last.receivedOn)}>
                    <span>{timeAgo(last.receivedOn)}</span>
                  </Tooltip>
                  <button type="button" onClick={() => onReceipt(last)} className="cursor-pointer font-medium text-primary hover:underline">
                    Receipt
                  </button>
                </span>
              )}
              {clearing.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {clearing.length} {clearing.length === 1 ? "cheque" : "cheques"} clearing
                </span>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Documents" action={<More onClick={() => onTab("documents")}>Folder</More>}>
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", missing.length ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${required.length ? ((required.length - missing.length) / required.length) * 100 : 100}%` }}
              />
            </div>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {required.length - missing.length}/{required.length} required
            </span>
          </div>
          {missing.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {missing.map((c) => (
                <span
                  key={c.key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px]",
                    c.gate === nextGate ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "text-muted-foreground",
                  )}
                >
                  <Icon name={c.icon ?? "file-line"} />
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Key dates">
          <ol className="flex">
            {dates.map((d, i) => (
              <li key={d.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
                {i > 0 && <span className={cn("absolute top-[5px] right-1/2 h-px w-full", d.at ? "bg-primary/50" : "bg-border")} aria-hidden />}
                <span className={cn("relative size-2.5 rounded-full", d.at ? "bg-primary" : "border bg-background")} aria-hidden />
                <span className={cn("mt-1.5 text-[13px]", d.at ? "font-medium" : "text-muted-foreground")}>{d.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{d.at ? formatDate(d.at) : "—"}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
