"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { MethodText, ReceiptBadge } from "@/modules/operations/components/sales-parts"
import { ApprovalReasonDialog, SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { setChequeStatus } from "../server/actions"
import { VoucherLinks, financeNav, rs } from "./money-parts"
import { bookingHref } from "./receipts-view"

// Finance › Cheques: cheques and pay orders in clearing (oldest first), cleared or bounced from
// here, and the last six months of cleared and bounced ones.
//   clearing / history: chequeRegister() · can: { act (finance.create), direct (a cheques grant) }

const DAY = 86_400_000

export function ChequesView({ clearing, history, can }) {
  const router = useRouter()
  const { title, description } = financeNav("/finance/cheques")
  const [tab, setTab] = useState("clearing")
  const [q, setQ] = useState("")
  const [asking, setAsking] = useState(null) // { receipt, status }
  const [busy, startTransition] = useTransition()
  const [now] = useState(() => Date.now())
  const age = (r) => Math.max(0, Math.floor((now - new Date(r.receivedOn).getTime()) / DAY))

  const list = tab === "clearing" ? clearing : history
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return list.filter((r) => !term || [r.code, r.chequeNo, r.chequeBank, r.booking.code, r.booking.buyer, r.booking.unit].some((v) => v?.toLowerCase().includes(term)))
  }, [list, q])

  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0)
  const old = clearing.filter((r) => age(r) > 7)
  const recent = history.filter((r) => now - new Date(r.status === "cleared" ? r.clearedAt : r.bouncedAt).getTime() <= 30 * DAY)
  const bounced30 = recent.filter((r) => r.status === "bounced")

  const run = (r, status, reason = "") =>
    startTransition(async () => {
      const res = await toastAction(() => setChequeStatus(r.code, status, reason), {
        loading: can.direct ? "Saving…" : "Sending…",
        success: (x) =>
          x.pending
            ? SENT_FOR_APPROVAL
            : status === "cleared"
              ? `${r.chequeNo ? `Cheque ${r.chequeNo}` : r.code} cleared into the bank.`
              : `${r.chequeNo ? `Cheque ${r.chequeNo}` : r.code} bounced: the installment is due again.`,
      })
      if (res?.ok) {
        setAsking(null)
        router.refresh()
      }
    })

  const act = async (r, status) => {
    if (!can.direct) return setAsking({ receipt: r, status })
    const ok = await confirm(
      status === "cleared"
        ? {
            title: `Mark ${r.chequeNo ? `cheque ${r.chequeNo}` : r.code} cleared?`,
            description: `${rs(r.amount)} from ${r.booking.buyer} moves from Cheques in clearing into ${r.account?.name ?? "the bank"} and counts towards the booking.`,
            confirmLabel: "Mark cleared",
            icon: "checkbox-circle-line",
          }
        : {
            title: `Mark ${r.chequeNo ? `cheque ${r.chequeNo}` : r.code} bounced?`,
            description: `The ${rs(r.amount)} no longer counts as paid and the installment it covered is due again. The buyer's seller and handler are told.`,
            confirmLabel: "Mark bounced",
            destructive: true,
            icon: "close-circle-line",
          },
    )
    if (ok) run(r, status)
  }

  const columns = [
    {
      key: "cheque",
      header: "Cheque",
      sortValue: (r) => r.chequeNo ?? r.code,
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-medium tabular-nums">{r.chequeNo ? `No. ${r.chequeNo}` : r.code}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <MethodText method={r.method} className="text-xs" />
            {r.chequeBank && ` · ${r.chequeBank}`}
          </span>
        </div>
      ),
    },
    {
      key: "buyer",
      header: "From",
      sortValue: (r) => r.booking.buyer.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate">{r.booking.buyer}</span>
          <Link href={bookingHref(r.booking.code)} className="block truncate font-mono text-xs text-muted-foreground hover:text-primary">
            {r.booking.code} · {r.booking.unit}
          </Link>
        </div>
      ),
    },
    {
      key: "dated",
      header: "Dated",
      sortValue: (r) => (r.chequeDate ? new Date(r.chequeDate).getTime() : 0),
      cell: (r) => <span className="whitespace-nowrap">{r.chequeDate ? formatDate(r.chequeDate) : <span className="text-muted-foreground">—</span>}</span>,
    },
    tab === "clearing"
      ? {
          key: "age",
          header: "Received",
          sortValue: (r) => age(r),
          cell: (r) => (
            <span className="whitespace-nowrap">
              {formatDate(r.receivedOn)}
              <span className={cn("block text-xs", age(r) > 7 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{age(r) === 0 ? "Today" : `${age(r)} ${age(r) === 1 ? "day" : "days"} ago`}</span>
            </span>
          ),
        }
      : {
          key: "when",
          header: "Cleared / bounced",
          sortValue: (r) => new Date(r.clearedAt ?? r.bouncedAt ?? 0).getTime(),
          cell: (r) => <span className="whitespace-nowrap">{formatDate(r.status === "cleared" ? r.clearedAt : r.bouncedAt)}</span>,
        },
    { key: "account", header: "Into", sortValue: (r) => r.account?.name ?? "", cell: (r) => <span className="block max-w-40 truncate text-muted-foreground">{r.account?.name ?? "Default bank"}</span> },
    { key: "amount", header: "Amount", className: "text-right whitespace-nowrap tabular-nums", sortValue: (r) => r.amount, cell: (r) => rs(r.amount) },
    tab === "clearing"
      ? {
          key: "actions",
          header: <span className="sr-only">Actions</span>,
          cell: (r) =>
            r.approval ? (
              <span className="flex justify-end">
                <Badge color="violet" className="whitespace-nowrap">
                  Waiting for approval
                </Badge>
              </span>
            ) : (
              can.act && (
                <span className="flex justify-end gap-1.5">
                  <Button size="sm" variant="outline" leftIcon="checkbox-circle-line" disabled={busy} onClick={() => act(r, "cleared")}>
                    {can.direct ? "Clear" : "Request clear"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    leftIcon="close-circle-line"
                    disabled={busy}
                    onClick={() => act(r, "bounced")}
                  >
                    {can.direct ? "Bounce" : "Request bounce"}
                  </Button>
                </span>
              )
            ),
        }
      : {
          key: "status",
          header: "Status",
          sortValue: (r) => r.status,
          cell: (r) => (
            <span className="flex flex-col items-start gap-0.5">
              <ReceiptBadge status={r.status} />
              <VoucherLinks vouchers={r.vouchers.filter((v) => v.event === r.status)} className="text-xs" />
            </span>
          ),
        },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <div className="min-w-32 flex-1 sm:max-w-72">
            <Input type="search" aria-label="Search cheques" placeholder="Cheque no., bank, buyer or booking…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        actions={
          <ToggleGroup
            aria-label="Show"
            value={tab}
            onChange={(v) => v && setTab(v)}
            options={[
              { value: "clearing", label: `In clearing · ${clearing.length}` },
              { value: "history", label: "Cleared & bounced" },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="time-line" tone="amber" label="In clearing" value={formatPkr(sum(clearing))} hint={`${clearing.length} ${clearing.length === 1 ? "cheque" : "cheques"}`} />
        <StatTile icon="alarm-warning-line" tone="red" label="Over a week old" value={old.length} hint={old.length ? formatPkr(sum(old)) : "None"} />
        <StatTile icon="checkbox-circle-line" tone="green" label="Cleared in 30 days" value={formatPkr(sum(recent.filter((r) => r.status === "cleared")))} hint={`${recent.length - bounced30.length} cheques`} />
        <StatTile icon="close-circle-line" tone="red" label="Bounced in 30 days" value={bounced30.length} hint={bounced30.length ? formatPkr(sum(bounced30)) : "None"} />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          key={tab}
          columns={columns}
          rows={shown}
          rowKey={(r) => r.code}
          minWidth="60rem"
          defaultSort={tab === "clearing" ? { key: "age", dir: "desc" } : { key: "when", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">{tab === "clearing" ? "No cheques waiting to clear." : "Nothing cleared or bounced in the last six months."}</p>}
        />
      </div>
      {asking && (
        <ApprovalReasonDialog
          title={`Request to mark ${asking.receipt.chequeNo ? `cheque ${asking.receipt.chequeNo}` : asking.receipt.code} ${asking.status}`}
          description={`Your role can't clear or bounce cheques. Someone who can gets this in their Approvals inbox; ${asking.status === "cleared" ? "it counts once they approve" : "the installment is due again once they approve"}.`}
          placeholder={asking.status === "cleared" ? "e.g. Showing in the bank statement today." : "e.g. Returned by the bank: insufficient funds."}
          onSend={(reason) => run(asking.receipt, asking.status, reason)}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}
