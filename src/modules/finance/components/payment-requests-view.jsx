"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { cancelPaymentRequest, createPaymentRequest, loadRequestLines, markPaymentRequestPaid } from "../server/request-actions"
import { AccountSelect, addDays, defaultAccount, financeNav, pkDayOf, pkToday, rs } from "./money-parts"
import { PaymentRequestDocument } from "./payment-request-document"
import { bookingHref } from "./receipts-view"

// Finance › Payment requests: invoices to buyers for installments due and fees, printed with the
// bank details to pay into. They turn Paid on their own once the installments are paid.
//   requests: paymentRequestList() · bookings: receivableBookings() · accounts: moneyAccounts()
//   can: { create, edit } · initialNew: a booking code to start a request for (?new=bk-…)
//   initialOpen: a request to show right away (?open=inv-…, from Spotlight search)

const SHOW = [
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Canceled" },
  { value: "all", label: "All" },
]

function StatusBadge({ request: q, today }) {
  if (q.status === "paid") return <Badge color="green">Paid</Badge>
  if (q.status === "cancelled") return <Badge color="gray">Canceled</Badge>
  return pkDayOf(q.dueOn) < today ? <Badge color="red">Overdue</Badge> : <Badge color="blue">Issued</Badge>
}

export function PaymentRequestsView({ requests, bookings, accounts, brand, can, initialNew = null, initialOpen = null }) {
  const router = useRouter()
  const { title, description } = financeNav("/finance/payment-requests")
  const opening = initialOpen ? requests.find((r) => r.code.toLowerCase() === String(initialOpen).toLowerCase()) : null
  // Listed under the filter that includes it
  const [show, setShow] = useState(opening && opening.status !== "issued" ? "all" : "open")
  const [q, setQ] = useState("")
  const [today] = useState(pkToday)
  const startCode = initialNew ? (bookings.find((b) => b.code.toLowerCase() === String(initialNew).toLowerCase())?.code ?? null) : null
  const [creating, setCreating] = useState(Boolean(startCode) && can.create)
  const [preview, setPreview] = useState(opening?.code ?? null)
  const [busy, startTransition] = useTransition()

  const open = requests.filter((r) => r.status === "issued")
  const overdue = open.filter((r) => pkDayOf(r.dueOn) < today)
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return requests.filter((r) => {
      if (show === "open" && r.status !== "issued") return false
      if (["paid", "cancelled"].includes(show) && r.status !== show) return false
      return !term || [r.code, r.buyer.name, r.booking?.code, r.unit?.number, r.unit?.project].some((v) => v?.toLowerCase().includes(term))
    })
  }, [requests, show, q])
  const sum = (l) => l.reduce((s, r) => s + r.total, 0)
  const paid30 = requests.filter((r) => r.status === "paid" && r.paidAt && new Date(r.paidAt) >= new Date(`${addDays(today, -30)}T00:00:00`))

  const act = (fn, messages) =>
    startTransition(async () => {
      const r = await toastAction(fn, messages)
      if (r?.ok) router.refresh()
    })
  const cancel = async (r) => {
    const ok = await confirm({
      title: `Cancel ${r.code}?`,
      description: `The ${rs(r.total)} request to ${r.buyer.name} is marked canceled. Anything already paid still counts on the booking.`,
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it",
      destructive: true,
      icon: "close-circle-line",
    })
    if (ok) act(() => cancelPaymentRequest(r.code), { loading: "Canceling…", success: `${r.code} canceled.` })
  }
  const markPaid = async (r) => {
    const ok = await confirm({
      title: `Mark ${r.code} paid?`,
      description: "Use this for fees and other lines the booking's payments don't cover. Installments mark themselves paid once their payments clear.",
      confirmLabel: "Mark paid",
      icon: "checkbox-circle-line",
    })
    if (ok) act(() => markPaymentRequestPaid(r.code), { loading: "Saving…", success: `${r.code} marked paid.` })
  }

  const columns = [
    {
      key: "code",
      header: "Request",
      sortValue: (r) => new Date(r.issuedOn).getTime(),
      cell: (r) => (
        <span className="whitespace-nowrap">
          <span className="font-mono text-[13px] font-medium">{r.code}</span>
          <span className="block text-xs text-muted-foreground">Issued {formatDate(r.issuedOn)}</span>
        </span>
      ),
    },
    {
      key: "buyer",
      header: "Buyer",
      sortValue: (r) => r.buyer.name.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{r.buyer.name}</span>
          {r.booking && (
            <Link href={bookingHref(r.booking.code)} className="block truncate text-xs text-muted-foreground hover:text-primary">
              <span className="font-mono">{r.booking.code}</span>
              {r.unit && ` · ${r.unit.project} ${r.unit.number}`}
            </Link>
          )}
        </div>
      ),
    },
    { key: "lines", header: "For", sortValue: (r) => r.lines.length, cell: (r) => <span className="block max-w-64 truncate text-muted-foreground">{r.lines.map((l) => l.label).join(", ")}</span> },
    {
      key: "due",
      header: "Due",
      sortValue: (r) => new Date(r.dueOn).getTime(),
      cell: (r) => <span className={cn("whitespace-nowrap", r.status === "issued" && pkDayOf(r.dueOn) < today && "text-red-600 dark:text-red-400")}>{formatDate(r.dueOn)}</span>,
    },
    { key: "total", header: "Total", className: "text-right whitespace-nowrap tabular-nums", sortValue: (r) => r.total, cell: (r) => rs(r.total) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge request={r} today={today} /> },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <span className="flex justify-end">
          <DropdownMenu
            align="end"
            items={[
              { label: "Print or download", icon: "printer-line", onClick: () => setPreview(r.code) },
              ...(r.booking ? [{ label: "Open booking", icon: "arrow-right-line", onClick: () => router.push(bookingHref(r.booking.code)) }] : []),
              ...(can.edit && r.status === "issued"
                ? [
                    { type: "separator" },
                    { label: "Mark paid", icon: "checkbox-circle-line", onClick: () => markPaid(r) },
                    { label: "Cancel request", icon: "close-circle-line", variant: "destructive", onClick: () => cancel(r) },
                  ]
                : []),
            ]}
            trigger={<IconButton icon="more-2-line" aria-label="Actions" tooltip={false} disabled={busy} />}
          />
        </span>
      ),
    },
  ]

  const shownPreview = preview ? requests.find((r) => r.code === preview) : null

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search payment requests" placeholder="Request, buyer, booking or unit…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <ToggleGroup aria-label="Show" value={show} onChange={(v) => v && setShow(v)} options={SHOW} />
          </>
        }
        actions={
          can.create && (
            <Button leftIcon="add-line" onClick={() => setCreating(true)}>
              New request
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="file-text-line" tone="sky" label="Open requests" value={formatPkr(sum(open))} hint={`${open.length} issued`} />
        <StatTile icon="alarm-warning-line" tone="red" label="Past due" value={formatPkr(sum(overdue))} hint={`${overdue.length} ${overdue.length === 1 ? "request" : "requests"}`} />
        <StatTile icon="checkbox-circle-line" tone="green" label="Paid in 30 days" value={formatPkr(sum(paid30))} hint={`${paid30.length} ${paid30.length === 1 ? "request" : "requests"}`} />
        <StatTile icon="file-list-3-line" label="All requests" value={requests.length} hint={`${requests.filter((r) => r.status === "cancelled").length} canceled`} />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.code}
          minWidth="62rem"
          activeKey={preview}
          onRowClick={(r) => setPreview(r.code)}
          defaultSort={{ key: "code", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">{requests.length ? "Nothing here." : "No payment requests yet."}</p>}
        />
      </div>
      {creating && (
        <NewRequestDialog
          bookings={bookings}
          accounts={accounts}
          initialBooking={startCode}
          onClose={() => {
            setCreating(false)
            if (startCode) router.replace("/finance/payment-requests")
          }}
          onDone={(code) => {
            setCreating(false)
            router.replace("/finance/payment-requests")
            router.refresh()
            setPreview(code)
          }}
        />
      )}
      {shownPreview && (
        <PrintPreviewDialog
          title={`Payment request ${shownPreview.code}`}
          printUrl={`/finance/payment-requests/${urlCode(shownPreview.code)}/print`}
          pdfUrl={`/api/finance/payment-requests/${urlCode(shownPreview.code)}/pdf`}
          onClose={() => setPreview(null)}
        >
          <PaymentRequestDocument request={shownPreview} brand={brand} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}

// ---------- new request ----------

const DUE_NOW = ["overdue", "partial", "due-soon"]

function NewRequestDialog({ bookings, accounts, initialBooking, onClose, onDone }) {
  const [code, setCode] = useState(initialBooking)
  const [lines, setLines] = useState(null) // installments still owed, once a booking is picked
  const [picked, setPicked] = useState(() => new Set())
  const [extras, setExtras] = useState([])
  const [dueOn, setDueOn] = useState(() => addDays(pkToday(), 7))
  const [accountId, setAccountId] = useState(() => defaultAccount(accounts, "bank") ?? defaultAccount(accounts))
  const [notes, setNotes] = useState("")
  const [errors, setErrors] = useState({})
  const [loading, startLoading] = useTransition()
  const [pending, startTransition] = useTransition()
  const b = bookings.find((x) => x.code === code) ?? null
  const banks = accounts.filter((a) => a.kind === "bank")
  useUnsavedGuard(Boolean(code || extras.length || notes))

  // The installments still owed on a booking, the ones due now ticked
  const load = (next) =>
    startLoading(async () => {
      const r = await loadRequestLines(next)
      if (r.error) return setErrors({ bookingCode: r.error })
      setErrors({})
      setLines(r.lines)
      const due = r.lines.filter((l) => DUE_NOW.includes(l.state) && !l.onRequest)
      setPicked(new Set((due.length ? due : r.lines.filter((l) => !l.onRequest).slice(0, 1)).map((l) => l.id)))
    })
  const pickBooking = (next) => {
    setCode(next)
    setLines(null)
    setPicked(new Set())
    if (next) load(next)
  }
  // A booking handed in from the URL (?new=…) loads once the dialog opens
  useEffect(() => {
    if (initialBooking) load(initialBooking)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, [])

  const toggle = (id, on) =>
    setPicked((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const setExtra = (i, patch) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const total = (lines ?? []).filter((l) => picked.has(l.id)).reduce((s, l) => s + l.balance, 0) + extras.reduce((s, x) => s + (Number(x.amount) || 0), 0)

  const submit = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(
        () =>
          createPaymentRequest({
            bookingCode: code ?? "",
            installments: [...picked],
            extras: extras.map((x) => ({ label: x.label, amount: x.amount ?? 0 })),
            dueOn,
            accountId,
            notes,
          }),
        { loading: "Creating…", success: (x) => `Payment request ${x.code} created.` },
      )
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone(r.code)
    })

  const options = useMemo(() => bookings.map((x) => ({ value: x.code, label: `${x.buyer} · ${x.code}`, description: `${x.project} · unit ${x.unit} · ${rs(x.left)} left` })), [bookings])

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title="New payment request"
      description="An invoice to the buyer for what's due, with your bank details to pay into. It turns Paid once the installments are paid."
      footer={
        <>
          <span className="mr-auto self-center text-sm tabular-nums max-sm:order-last">
            Total <span className="font-semibold">{rs(total)}</span>
          </span>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="file-text-line" loading={pending} disabled={!b || total <= 0} onClick={submit}>
            Create request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Combobox label="Booking" placeholder="Booking code, buyer or unit…" options={options} value={code} onChange={pickBooking} error={errors.bookingCode} emptyText="No open booking matches" />
        {b && (
          <div className="rounded-xl border">
            <p className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="font-medium">Installments still owed</span>
              <span className="text-muted-foreground tabular-nums">{rs(b.left)} left on the booking</span>
            </p>
            {loading || !lines ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : lines.length ? (
              <ul className="max-h-64 divide-y overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox checked={picked.has(l.id)} onChange={(on) => toggle(l.id, on)} aria-label={l.label} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{l.label}</span>
                      <span className={cn("block text-xs", l.state === "overdue" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        Due {formatDate(l.dueDate)}
                        {l.state === "overdue" && " · overdue"}
                        {l.onRequest && ` · already on ${l.onRequest}`}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      {rs(l.balance)}
                      {l.balance < l.amount && <span className="block text-xs text-muted-foreground">of {rs(l.amount)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No installments left to request. Add a line below for a fee or charge.</p>
            )}
          </div>
        )}
        {errors.lines && <p className="text-xs text-destructive">{errors.lines}</p>}
        <div className="space-y-2">
          {extras.map((x, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-end gap-2">
              <Input
                label={i === 0 ? "Other charge" : undefined}
                aria-label="What it's for"
                placeholder="e.g. Late payment charge, transfer fee"
                value={x.label}
                onChange={(e) => setExtra(i, { label: e.target.value })}
                error={errors[`extras.${i}.label`]}
              />
              <NumberInput label={i === 0 ? "Amount" : undefined} aria-label="Amount" prefix="Rs" min={1} value={x.amount} onChange={(v) => setExtra(i, { amount: v })} error={errors[`extras.${i}.amount`]} />
              <IconButton icon="delete-bin-line" aria-label="Remove line" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))} />
            </div>
          ))}
          {extras.length < 10 && (
            <Button size="sm" variant="ghost" leftIcon="add-line" onClick={() => setExtras((xs) => [...xs, { label: "", amount: null }])}>
              Add a charge or fee
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker label="Pay by" value={dueOn} minDate={pkToday()} onChange={(v) => v && setDueOn(v)} clearable={false} error={errors.dueOn} />
          <AccountSelect label="Pay into" accounts={banks.length ? banks : accounts} value={accountId} onChange={setAccountId} error={errors.accountId} />
        </div>
        <Textarea
          label="Note on the request (optional)"
          rows={2}
          maxLength={500}
          placeholder="e.g. Please pay before the 10th to avoid the late payment charge."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
        />
      </div>
    </Dialog>
  )
}
