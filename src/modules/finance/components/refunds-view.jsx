"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { payBookingRefund } from "../server/actions"
import { AccountSelect, VoucherLinks, defaultAccount, financeNav, pkToday, rs } from "./money-parts"
import { bookingHref } from "./receipts-view"

// Finance › Refunds: what canceled bookings' buyers are still owed, paying it (in parts if need
// be), and what's been refunded.
//   rows: refundRegister() · accounts: moneyAccounts() · can: { pay (finance.create), direct (finance.refunds) }

export function RefundsView({ rows, accounts, can }) {
  const router = useRouter()
  const { title, description } = financeNav("/finance/refunds")
  const [tab, setTab] = useState("owed")
  const [q, setQ] = useState("")
  const [paying, setPaying] = useState(null)
  const owed = rows.filter((r) => r.left > 0)
  const done = rows.filter((r) => r.refunded > 0)
  const list = tab === "owed" ? owed : done
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return list.filter((r) => !term || [r.code, r.buyer, r.unit, r.project, r.phone].some((v) => v?.toLowerCase().includes(term)))
  }, [list, q])
  const sum = (l, k) => l.reduce((s, r) => s + r[k], 0)

  const columns = [
    {
      key: "buyer",
      header: "Buyer",
      sortValue: (r) => r.buyer.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{r.buyer}</span>
          <Link href={bookingHref(r.code)} className="block truncate font-mono text-xs text-muted-foreground hover:text-primary">
            {r.code}
          </Link>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      sortValue: (r) => `${r.project} ${r.unit}`,
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate">{r.project}</span>
          <span className="block truncate text-xs text-muted-foreground">Unit {r.unit}</span>
        </div>
      ),
    },
    {
      key: "cancelled",
      header: "Canceled",
      sortValue: (r) => new Date(r.cancelledAt ?? 0).getTime(),
      cell: (r) => (
        <span className="block max-w-56">
          <span className="whitespace-nowrap">{formatDate(r.cancelledAt)}</span>
          {r.reason && (
            <span className="block truncate text-xs text-muted-foreground" title={r.reason}>
              {r.reason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "owed",
      header: "Refund due",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (r) => r.owed,
      cell: (r) => (
        <span>
          {rs(r.owed)}
          <span className="block text-xs text-muted-foreground">after {r.deductionPct}% deduction</span>
        </span>
      ),
    },
    tab === "owed"
      ? {
          key: "left",
          header: "Left to pay",
          className: "text-right whitespace-nowrap tabular-nums",
          sortValue: (r) => r.left,
          cell: (r) => (
            <span>
              <span className="font-semibold">{rs(r.left)}</span>
              {r.refunded > 0 && <span className="block text-xs text-muted-foreground">{rs(r.refunded)} paid</span>}
            </span>
          ),
        }
      : {
          key: "refunded",
          header: "Refunded",
          className: "text-right whitespace-nowrap tabular-nums",
          sortValue: (r) => r.refunded,
          cell: (r) => (
            <span className="flex flex-col items-end">
              {rs(r.refunded)}
              <VoucherLinks vouchers={r.payments.map((p) => ({ code: p.code, status: "posted" }))} className="justify-end text-xs" />
            </span>
          ),
        },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        tab !== "owed" ? (
          <span className="flex justify-end">
            <Badge color={r.status === "refunded" ? "green" : "amber"}>{r.status === "refunded" ? "Fully refunded" : "Part refunded"}</Badge>
          </span>
        ) : r.approval ? (
          <span className="flex justify-end">
            <Badge color="violet" className="whitespace-nowrap">
              Waiting for approval
            </Badge>
          </span>
        ) : (
          can.pay && (
            <span className="flex justify-end">
              <Button size="sm" variant="outline" leftIcon="refund-2-line" onClick={() => setPaying(r)}>
                {can.direct ? "Pay refund" : "Request refund"}
              </Button>
            </span>
          )
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
            <Input type="search" aria-label="Search refunds" placeholder="Buyer, booking or unit…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        actions={
          <ToggleGroup
            aria-label="Show"
            value={tab}
            onChange={(v) => v && setTab(v)}
            options={[
              { value: "owed", label: `Owed · ${owed.length}` },
              { value: "done", label: "Refunded" },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="refund-2-line" tone="amber" label="Owed to buyers" value={formatPkr(sum(owed, "left"))} hint={`${owed.length} canceled ${owed.length === 1 ? "booking" : "bookings"}`} />
        <StatTile icon="shield-check-line" tone="violet" label="Waiting for approval" value={owed.filter((r) => r.approval).length} hint="Refund requests" />
        <StatTile icon="checkbox-circle-line" tone="green" label="Refunded" value={formatPkr(sum(rows, "refunded"))} hint={`${done.length} ${done.length === 1 ? "booking" : "bookings"}`} />
        <StatTile
          icon="scissors-cut-line"
          label="Kept as deductions"
          value={formatPkr(rows.reduce((s, r) => s + (r.deductionPct > 0 && r.deductionPct < 100 ? (r.owed * r.deductionPct) / (100 - r.deductionPct) : 0), 0))}
          hint="From canceled bookings"
        />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          key={tab}
          columns={columns}
          rows={shown}
          rowKey={(r) => r.code}
          minWidth="60rem"
          defaultSort={{ key: "cancelled", dir: tab === "owed" ? "asc" : "desc" }}
          empty={<p className="text-sm text-muted-foreground">{tab === "owed" ? "No refunds owed. Nice." : "Nothing refunded yet."}</p>}
        />
      </div>
      {paying && (
        <RefundDialog
          row={paying}
          accounts={accounts}
          direct={can.direct}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function RefundDialog({ row: r, accounts, direct, onClose, onDone }) {
  const [form, setForm] = useState(() => ({ date: pkToday(), amount: r.left, accountId: defaultAccount(accounts, "bank") ?? defaultAccount(accounts), chequeNo: "", reference: "" }))
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  useUnsavedGuard(Boolean(form.chequeNo || form.reference || form.amount !== r.left))
  const submit = () =>
    startTransition(async () => {
      setErrors({})
      const res = await toastAction(() => payBookingRefund(r.code, { ...form, amount: form.amount ?? 0 }, reason), {
        loading: direct ? "Paying…" : "Sending…",
        success: (x) => (x.pending ? SENT_FOR_APPROVAL : `Refund of ${rs(form.amount)} paid (${x.code}).`),
      })
      if (res?.fieldErrors) setErrors(res.fieldErrors)
      else if (res?.ok) onDone()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-lg"
      title={direct ? `Pay refund to ${r.buyer}` : `Request a refund to ${r.buyer}`}
      description={`Canceled booking ${r.code}. ${rs(r.left)} left to refund${r.refunded ? ` (${rs(r.refunded)} already paid)` : ""}.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={direct ? "refund-2-line" : "send-plane-line"} loading={pending} onClick={submit}>
            {direct ? "Pay refund" : "Send for approval"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="Amount" required prefix="Rs" min={1} max={r.left} value={form.amount} onChange={(v) => set({ amount: v })} error={errors.amount} />
          <DatePicker label="Paid on" value={form.date} maxDate={pkToday()} onChange={(v) => v && set({ date: v })} clearable={false} error={errors.date} />
        </div>
        <AccountSelect label="Paid from" accounts={accounts} value={form.accountId} onChange={(v) => set({ accountId: v })} error={errors.accountId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Cheque no." value={form.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} error={errors.chequeNo} />
          <Input label="Reference" placeholder="e.g. Transaction ID" value={form.reference} onChange={(e) => set({ reference: e.target.value })} error={errors.reference} />
        </div>
        {!direct && <Textarea label="Note for the approver (optional)" rows={2} maxLength={300} placeholder="e.g. Buyer collected the cheque at the counter." value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Dialog>
  )
}
