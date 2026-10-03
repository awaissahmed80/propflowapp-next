"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MethodText, ReceiptBadge } from "@/modules/operations/components/sales-parts"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { PERIODS, periodRange } from "../constants"
import { receiveBookingPayment } from "../server/actions"
import { AccountSelect, Fact, VoucherLinks, defaultAccount, financeNav, pkToday, rs } from "./money-parts"

// Finance › Receipts: every payment on every booking (Operations and the cashier), and taking one.
//   receipts: financeReceipts() · bookings: receivableBookings() · accounts: moneyAccounts()
//   can: { create (take payments), post (they count at once; otherwise they wait in Approvals) }

const STATUS = [
  { value: "cleared", label: "Cleared" },
  { value: "clearing", label: "In clearing" },
  { value: "pending", label: "Waiting for approval" },
  { value: "bounced", label: "Bounced" },
  { value: "rejected", label: "Not approved" },
  { value: "cancelled", label: "Canceled" },
]
const CLEARS_LATER = ["cheque", "pay-order"]
const REF_LABEL = { cash: "Receipt book no.", "bank-transfer": "Transaction ID", jazzcash: "Transaction ID", easypaisa: "Transaction ID" }
export const bookingHref = (code) => `/operations/bookings/${urlCode(code)}`

export function ReceiptsView({ receipts, bookings, accounts, projects, can, initialOpen = null }) {
  const router = useRouter()
  const methods = useList("payment-method")
  const { title, description } = financeNav("/finance/receipts")
  const [period, setPeriod] = useState("this-month")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ status: [], method: [], account: [], project: [] })
  const [now] = useState(() => new Date())
  const [open, setOpen] = useState(() => (initialOpen ? (receipts.find((r) => r.code.toLowerCase() === String(initialOpen).toLowerCase())?.code ?? null) : null))
  const [receiving, setReceiving] = useState(false)

  const groups = [
    { key: "status", label: "Status", icon: "pulse-line", options: STATUS },
    { key: "method", label: "Method", icon: "bank-card-line", options: methods.options.map((o) => ({ value: o.value, label: o.label, icon: o.icon })) },
    { key: "account", label: "Account", icon: "bank-line", options: accounts.map((a) => ({ value: String(a.id), label: a.name })) },
    { key: "project", label: "Project", icon: "community-line", options: projects.map((p) => ({ value: p.code, label: p.name })) },
  ]

  const range = useMemo(() => periodRange(period, now), [period, now])
  const scoped = useMemo(
    () =>
      receipts.filter((r) => {
        const t = new Date(r.receivedOn)
        return (!range.from || t >= range.from) && t <= new Date(range.to.getTime() + 86_400_000)
      }),
    [receipts, range],
  )
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return scoped.filter((r) => {
      if (filters.status.length && !filters.status.includes(r.status)) return false
      if (filters.method.length && !filters.method.includes(r.method)) return false
      if (filters.account.length && !filters.account.includes(String(r.account?.id ?? ""))) return false
      if (filters.project.length && !filters.project.includes(r.booking.project.code)) return false
      return !term || [r.code, r.reference, r.chequeNo, r.booking.code, r.booking.buyer, r.booking.unit, r.booking.project.name].some((v) => v?.toLowerCase().includes(term))
    })
  }, [scoped, q, filters])

  const sum = (list) => list.reduce((s, r) => s + r.amount, 0)
  const cleared = scoped.filter((r) => r.status === "cleared")
  const clearing = receipts.filter((r) => r.status === "clearing")
  const waiting = receipts.filter((r) => r.status === "pending")
  const bounced = scoped.filter((r) => r.status === "bounced")
  const periodLabel = PERIODS.find((p) => p.value === period)?.label.toLowerCase()
  const detail = open ? receipts.find((r) => r.code === open) : null

  const columns = [
    {
      key: "date",
      header: "Date",
      sortValue: (r) => new Date(r.receivedOn).getTime(),
      cell: (r) => (
        <span className="whitespace-nowrap">
          {formatDate(r.receivedOn)}
          <span className="block font-mono text-[11px] text-muted-foreground">{r.code}</span>
        </span>
      ),
    },
    {
      key: "buyer",
      header: "Buyer",
      sortValue: (r) => r.booking.buyer.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{r.booking.buyer}</span>
          <Link href={bookingHref(r.booking.code)} className="block truncate font-mono text-xs text-muted-foreground hover:text-primary">
            {r.booking.code}
          </Link>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      sortValue: (r) => `${r.booking.project.name} ${r.booking.unit}`,
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate">{r.booking.project.name}</span>
          <span className="block truncate text-xs text-muted-foreground">Unit {r.booking.unit}</span>
        </div>
      ),
    },
    {
      key: "method",
      header: "Method",
      sortValue: (r) => r.method,
      cell: (r) => (
        <span className="min-w-0">
          <MethodText method={r.method} />
          {(r.chequeNo || r.reference) && <span className="block max-w-44 truncate text-xs text-muted-foreground">{r.chequeNo ? `No. ${r.chequeNo}${r.chequeBank ? ` · ${r.chequeBank}` : ""}` : r.reference}</span>}
        </span>
      ),
    },
    { key: "account", header: "Account", sortValue: (r) => r.account?.name ?? "", cell: (r) => <span className="block max-w-44 truncate text-muted-foreground">{r.account?.name ?? "Default"}</span> },
    { key: "amount", header: "Amount", className: "text-right whitespace-nowrap tabular-nums", sortValue: (r) => r.amount, cell: (r) => rs(r.amount) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <ReceiptBadge status={r.status} /> },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search receipts" placeholder="Receipt, buyer, booking or cheque…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <Select aria-label="Period" className="w-44" value={period} onChange={(v) => v && setPeriod(v)} options={PERIODS} />
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          can.create && (
            <Button leftIcon="add-line" onClick={() => setReceiving(true)}>
              Receive payment
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="wallet-3-line" tone="green" label="Collected" value={formatPkr(sum(cleared))} hint={`${cleared.length} payments · ${periodLabel}`} />
        <StatTile icon="time-line" tone="amber" label="In clearing" value={formatPkr(sum(clearing))} hint={`${clearing.length} cheques and pay orders`} />
        <StatTile icon="shield-check-line" tone="violet" label="Waiting for approval" value={formatPkr(sum(waiting))} hint={`${waiting.length} ${waiting.length === 1 ? "payment" : "payments"}`} />
        <StatTile icon="close-circle-line" tone="red" label="Bounced" value={formatPkr(sum(bounced))} hint={`${bounced.length} · ${periodLabel}`} />
      </div>
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.code}
          minWidth="64rem"
          activeKey={open}
          onRowClick={(r) => setOpen(r.code)}
          defaultSort={{ key: "date", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">No receipts {period === "all" ? "yet" : "in this period"}.</p>}
        />
      </div>
      <p className="-mt-2 text-right text-sm text-muted-foreground tabular-nums">
        {shown.length} {shown.length === 1 ? "receipt" : "receipts"} · <span className="font-semibold text-foreground">{rs(sum(shown))}</span>
        {shown.some((r) => r.status !== "cleared") && <span> · {rs(sum(shown.filter((r) => r.status === "cleared")))} cleared</span>}
      </p>

      {detail && <ReceiptDetail receipt={detail} onClose={() => setOpen(null)} />}
      {receiving && (
        <ReceivePaymentDialog
          bookings={bookings}
          accounts={accounts}
          canPost={can.post}
          onClose={() => setReceiving(false)}
          onDone={(code) => {
            setReceiving(false)
            router.refresh()
            if (code) setOpen(code)
          }}
        />
      )}
    </div>
  )
}

// ---------- one receipt ----------

function ReceiptDetail({ receipt: r, onClose }) {
  const methods = useList("payment-method")
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-lg"
      title={`${rs(r.amount)} from ${r.booking.buyer}`}
      description={`${r.code} · ${formatDate(r.receivedOn)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button leftIcon="arrow-right-line" render={<Link href={bookingHref(r.booking.code)} />} nativeButton={false}>
            Open booking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ReceiptBadge status={r.status} />
          {r.approval && (
            <span className="text-xs text-muted-foreground">
              Request {r.approval.code} is waiting in Approvals{r.approval.type === "cheque" ? " (to clear or bounce it)" : ""}.
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Booking">
            <Link href={bookingHref(r.booking.code)} className="font-mono text-[14px] text-primary hover:underline">
              {r.booking.code}
            </Link>
          </Fact>
          <Fact label="Project and unit">
            {r.booking.project.name} · {r.booking.unit}
          </Fact>
          <Fact label="Method">{methods.label(r.method)}</Fact>
          <Fact label="Account">{r.account?.name ?? "The default account"}</Fact>
          {(r.chequeNo || CLEARS_LATER.includes(r.method)) && (
            <Fact label={r.method === "pay-order" ? "Pay order" : "Cheque"} wide>
              {[r.chequeNo && `No. ${r.chequeNo}`, r.chequeBank, r.chequeDate && `dated ${formatDate(r.chequeDate)}`].filter(Boolean).join(" · ")}
            </Fact>
          )}
          {r.reference && <Fact label="Reference">{r.reference}</Fact>}
          {r.clearedAt && <Fact label="Cleared">{formatDate(r.clearedAt)}</Fact>}
          {r.bouncedAt && <Fact label="Bounced">{formatDate(r.bouncedAt)}</Fact>}
          {r.notes && (
            <Fact label="For" wide>
              {r.notes}
            </Fact>
          )}
          <Fact label="Vouchers" wide>
            <VoucherLinks vouchers={r.vouchers} />
          </Fact>
        </dl>
        {r.status === "pending" && <p className="text-xs text-muted-foreground">It doesn&apos;t count and isn&apos;t posted until someone approves it.</p>}
      </div>
    </Dialog>
  )
}

// ---------- receive a payment ----------

export function ReceivePaymentDialog({ bookings, accounts, canPost, initialBooking = null, onClose, onDone }) {
  const methods = useList("payment-method")
  const firstMethod = methods.defaultValue ?? methods.options[0]?.value ?? "bank-transfer"
  const [code, setCode] = useState(initialBooking)
  const [form, setForm] = useState(() => ({
    receivedOn: pkToday(),
    amount: null,
    method: firstMethod,
    accountId: defaultAccount(accounts, firstMethod === "cash" ? "cash" : "bank") ?? defaultAccount(accounts),
    chequeNo: "",
    chequeBank: "",
    chequeDate: "",
    reference: "",
    notes: "",
  }))
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const b = bookings.find((x) => x.code === code) ?? null
  const dirty = Boolean(code || form.amount || form.reference || form.chequeNo || form.notes)
  useUnsavedGuard(dirty)
  const later = CLEARS_LATER.includes(form.method)
  const accountKind = form.method === "cash" ? "cash" : "bank"
  const fits = accounts.some((a) => a.kind === accountKind)

  const pickBooking = (next) => {
    setCode(next)
    const nb = bookings.find((x) => x.code === next)
    if (nb) set({ amount: Math.round(Math.min(nb.next?.balance || nb.left, nb.left)) || null, notes: nb.next?.label ?? "" })
  }
  const pickMethod = (m) => set({ method: m, accountId: defaultAccount(accounts, m === "cash" ? "cash" : "bank") ?? form.accountId })

  const submit = () =>
    startTransition(async () => {
      setErrors({})
      if (!b) return setErrors({ booking: "Pick the booking." })
      const r = await toastAction(() => receiveBookingPayment(b.code, { ...form, amount: form.amount ?? 0 }, reason), {
        loading: canPost ? "Recording…" : "Sending…",
        success: (res) => (res.pending ? SENT_FOR_APPROVAL : `Payment recorded (${res.receipt}).${later ? " It counts once it clears." : ""}`),
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone(r.receipt)
    })

  const options = useMemo(() => bookings.map((x) => ({ value: x.code, label: `${x.buyer} · ${x.code}`, description: `${x.project} · unit ${x.unit} · ${rs(x.left)} left${x.phone ? ` · ${x.phone}` : ""}` })), [bookings])

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      scrollable
      className="sm:max-w-xl"
      title="Receive payment"
      description={canPost ? "Payments go to the booking's oldest unpaid installment first." : "Your role can't post payments directly: it goes to Approvals and counts once approved."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={canPost ? "money-dollar-circle-line" : "send-plane-line"} loading={pending} disabled={!b} onClick={submit}>
            {canPost ? "Record payment" : "Send for approval"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Combobox label="Booking" placeholder="Booking code, buyer or unit…" options={options} value={code} onChange={pickBooking} error={errors.booking} emptyText="No open booking matches" />
        {b && (
          <dl className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Left to pay</dt>
              <dd className="font-semibold tabular-nums">{rs(b.left)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Next due</dt>
              <dd className="tabular-nums">
                {b.next ? (
                  <>
                    {b.next.label}: <span className="font-semibold">{rs(b.next.balance)}</span>{" "}
                    <span className={b.next.state === "overdue" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>· {formatDate(b.next.dueDate)}</span>
                  </>
                ) : (
                  "No schedule yet"
                )}
              </dd>
            </div>
            {b.overdue > 0 && <p className="col-span-3 text-xs text-red-600 dark:text-red-400">{rs(b.overdue)} is overdue on this booking.</p>}
          </dl>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="Amount" required prefix="Rs" min={1} max={b?.left} value={form.amount} onChange={(v) => set({ amount: v })} error={errors.amount} />
          <DatePicker label="Received on" value={form.receivedOn} maxDate={pkToday()} onChange={(v) => v && set({ receivedOn: v })} clearable={false} error={errors.receivedOn} />
          <Select label="Paid by" value={form.method} onChange={pickMethod} options={methods.options} error={errors.method} />
          {fits ? (
            <AccountSelect
              label={form.method === "cash" ? "Cash account" : later ? "Deposit into" : "Received into"}
              accounts={accounts}
              kind={accountKind}
              value={form.accountId}
              onChange={(v) => set({ accountId: v })}
              error={errors.accountId}
            />
          ) : (
            <AccountSelect label="Received into" accounts={accounts} value={form.accountId} onChange={(v) => set({ accountId: v })} error={errors.accountId} />
          )}
        </div>
        {later ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label={form.method === "pay-order" ? "Pay order no." : "Cheque no."}
              required={form.method === "cheque"}
              value={form.chequeNo}
              onChange={(e) => set({ chequeNo: e.target.value })}
              error={errors.chequeNo}
            />
            <Input label="Bank" placeholder="e.g. HBL" value={form.chequeBank} onChange={(e) => set({ chequeBank: e.target.value })} error={errors.chequeBank} />
            <DatePicker label={form.method === "pay-order" ? "Dated" : "Cheque date"} value={form.chequeDate} onChange={(v) => set({ chequeDate: v ?? "" })} error={errors.chequeDate} />
          </div>
        ) : (
          <Input label={REF_LABEL[form.method] ?? "Reference"} value={form.reference} onChange={(e) => set({ reference: e.target.value })} error={errors.reference} />
        )}
        <Input label="For (optional)" placeholder="e.g. Installment 4, down payment" value={form.notes} onChange={(e) => set({ notes: e.target.value })} error={errors.notes} />
        {later && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Icon name="information-line" className="mt-0.5 shrink-0" />
            It waits in clearing and counts once it&apos;s marked cleared in Cheques.
          </p>
        )}
        {!canPost && <Textarea label="Note for the approver (optional)" rows={2} maxLength={300} placeholder="e.g. Deposit slip checked at the counter." value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Dialog>
  )
}
