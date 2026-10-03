"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { loadBooking, setReceiptStatus } from "../server/bookings"
import { ApprovalReasonDialog, SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { ReceiptDialog } from "./booking-dialogs"
import { LineBadge, MethodText, ProofLink, ReceiptBadge, confirmBounce, useUnitText } from "./sales-parts"

// Sales › Installments (what to chase) and Sales › Receipts (what came in)

const bookingHref = (code) => `/operations/bookings/${urlCode(code)}`
const digits = (s) => String(s ?? "").replace(/\D/g, "")

// A WhatsApp reminder with the amount and date filled in
function waReminder(line) {
  const phone = digits(line.booking.buyer.phone).replace(/^0/, "92")
  const text = `Assalam o Alaikum ${line.booking.buyer.name.split(" ")[0]}, a gentle reminder that ${line.label.toLowerCase()} of Rs ${new Intl.NumberFormat("en-PK").format(Math.round(line.balance))} for ${line.booking.project.name} unit ${line.booking.unit.number} ${line.state === "overdue" ? `was due on ${formatDate(line.dueDate)}` : `is due on ${formatDate(line.dueDate)}`}. Please ignore if already paid. Shukriya.`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

// Open a booking's receipt dialog from a list: loads the booking first
//   direct: records at once (operations.receipts); otherwise payments are sent for approval
function useReceiptFor(direct = true) {
  const router = useRouter()
  const [open, setOpen] = useState(null) // { booking, line }
  // Acknowledgements and errors as toasts
  const setNotice = (n) => n && (n.tone === "error" ? toast.error(n.text) : toast.success(n.text))
  const [, startTransition] = useTransition()
  const start = (code, line = null) =>
    startTransition(async () => {
      const r = await loadBooking(code)
      if (r.error) setNotice({ tone: "error", text: r.error })
      else setOpen({ booking: r.booking, line })
    })
  const dialog = open && (
    <ReceiptDialog
      booking={open.booking}
      line={open.line}
      direct={direct}
      onClose={() => setOpen(null)}
      onDone={(text) => {
        setOpen(null)
        setNotice({ tone: "success", text })
        router.refresh()
      }}
    />
  )
  return { start, dialog }
}

//   canReceive: may take payments · receiveDirect: they count at once (otherwise sent for approval)
export function InstallmentsView({ lines, projects, canReceive, receiveDirect = canReceive }) {
  const [view, setView] = useState("overdue")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ project: [] })
  const unitText = useUnitText()
  const { start, dialog } = useReceiptFor(receiveDirect)
  const overdue = lines.filter((l) => l.state === "overdue")
  const soon = lines.filter((l) => l.state !== "overdue")
  const bookingsOverdue = new Set(overdue.map((l) => l.booking.code))
  const defaulters = new Set(lines.filter((l) => l.booking.status === "defaulter").map((l) => l.booking.code))
  const groups = [{ key: "project", label: "Project", icon: "community-line", options: projects.map((p) => ({ value: p.code, label: p.name })) }]

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (view === "overdue" ? overdue : view === "soon" ? soon : lines).filter((l) => {
      if (filters.project.length && !filters.project.includes(l.booking.project.code)) return false
      return !term || [l.booking.buyer.name, l.booking.code, l.booking.unit.number, l.booking.project.name].some((v) => v?.toLowerCase().includes(term))
    })
  }, [lines, overdue, soon, view, q, filters])

  const columns = [
    {
      key: "buyer",
      header: "Buyer",
      sortValue: (l) => l.booking.buyer.name.toLowerCase(),
      cell: (l) => (
        <div className="min-w-0">
          <Link href={bookingHref(l.booking.code)} className="block truncate font-medium hover:text-primary">
            {l.booking.buyer.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {l.booking.code} · {l.booking.buyer.phone}
          </span>
        </div>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      sortValue: (l) => `${l.booking.project.name} ${l.booking.unit.number}`,
      cell: (l) => (
        <div className="min-w-0">
          <span className="block truncate">
            {l.booking.unit.number} <span className="text-muted-foreground">· {unitText(l.booking.unit)}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">{l.booking.project.name}</span>
        </div>
      ),
    },
    { key: "label", header: "Installment", sortValue: (l) => l.label, cell: (l) => l.label },
    {
      key: "due",
      header: "Due",
      sortValue: (l) => new Date(l.dueDate).getTime(),
      cell: (l) => (
        <span className="whitespace-nowrap">
          {formatDate(l.dueDate)}
          {l.state === "overdue" && <span className="block text-xs text-red-600 dark:text-red-400">{l.daysLate} days late</span>}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount due",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (l) => l.balance,
      cell: (l) => (
        <span>
          {formatPkr(l.balance)}
          {l.balance < l.amount && <span className="block text-xs text-muted-foreground">of {formatPkr(l.amount)}</span>}
        </span>
      ),
    },
    { key: "state", header: "Status", sortValue: (l) => l.state, cell: (l) => <LineBadge line={l} /> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      cell: (l) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <a href={waReminder(l)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
            <Icon name="whatsapp-line" className="text-emerald-600" /> Remind
          </a>
          {canReceive && (
            <Button size="sm" variant="outline" onClick={() => start(l.booking.code, l)}>
              Receive
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Installments"
        description="Overdue and upcoming installments across every booking"
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search" placeholder="Buyer, booking or unit…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          <ToggleGroup
            aria-label="Show"
            value={view}
            onChange={(v) => v && setView(v)}
            options={[
              { value: "overdue", label: `Overdue · ${overdue.length}` },
              { value: "soon", label: `Due in 30 days · ${soon.length}` },
              { value: "all", label: "All open" },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon="alarm-warning-line"
          tone="red"
          label="Overdue"
          value={formatPkr(overdue.reduce((s, l) => s + l.balance, 0))}
          hint={`${bookingsOverdue.size} ${bookingsOverdue.size === 1 ? "booking" : "bookings"}`}
        />
        <StatTile icon="user-unfollow-line" tone="amber" label="Defaulters" value={defaulters.size} hint="3+ overdue, or 90+ days late" />
        <StatTile icon="calendar-event-line" tone="sky" label="Due in 30 days" value={formatPkr(soon.reduce((s, l) => s + l.balance, 0))} hint={`${soon.length} installments`} />
        <StatTile icon="wallet-3-line" label="To collect now" value={formatPkr(lines.reduce((s, l) => s + l.balance, 0))} hint="Overdue and due soon" />
      </div>
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(l) => l.id}
          minWidth="66rem"
          defaultSort={{ key: "due", dir: "asc" }}
          empty={<p className="text-sm text-muted-foreground">{view === "overdue" ? "Nothing overdue. Nice." : "Nothing here."}</p>}
        />
      </div>
      {dialog}
    </div>
  )
}

const PERIODS = { 30: "30 days", 90: "90 days", 365: "12 months", all: "All" }

//   can: { cheques: may clear or bounce (or ask to), chequesDirect: has a cheques grant }
export function ReceiptsView({ receipts, projects, can }) {
  const router = useRouter()
  const [period, setPeriod] = useState("90")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ status: [], method: [], project: [] })
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(null) // { receipt, status } to send for approval
  // Acknowledgements and errors as toasts
  const setNotice = (n) => n && (n.tone === "error" ? toast.error(n.text) : toast.success(n.text))
  const groups = [
    {
      key: "status",
      label: "Status",
      icon: "pulse-line",
      options: [
        { value: "cleared", label: "Cleared" },
        { value: "clearing", label: "In clearing" },
        { value: "pending", label: "Waiting for approval" },
        { value: "bounced", label: "Bounced" },
        { value: "rejected", label: "Not approved" },
        { value: "cancelled", label: "Canceled" },
      ],
    },
    { key: "project", label: "Project", icon: "community-line", options: projects.map((p) => ({ value: p.code, label: p.name })) },
  ]
  const [now] = useState(() => Date.now())
  const inPeriod = (r) => period === "all" || now - new Date(r.receivedOn).getTime() <= Number(period) * 86_400_000
  const scoped = receipts.filter(inPeriod)
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return scoped.filter((r) => {
      if (filters.status.length && !filters.status.includes(r.status)) return false
      if (filters.project.length && !filters.project.includes(r.booking.project.code)) return false
      return !term || [r.code, r.reference, r.chequeNo, r.booking.code, r.booking.buyer, r.booking.unit].some((v) => v?.toLowerCase().includes(term))
    })
  }, [scoped, q, filters])
  const clearing = receipts.filter((r) => r.status === "clearing")
  const cleared = scoped.filter((r) => r.status === "cleared")
  const digital = cleared.filter((r) => ["bank-transfer", "jazzcash", "easypaisa"].includes(r.method)).reduce((s, r) => s + r.amount, 0)
  const total = cleared.reduce((s, r) => s + r.amount, 0)

  const send = (r, status, reason = "") =>
    startTransition(async () => {
      const res = await setReceiptStatus(r.code, status, reason)
      setNotice(
        res.error ? { tone: "error", text: res.error } : { tone: "success", text: res.pending ? SENT_FOR_APPROVAL : status === "cleared" ? `${r.code} cleared.` : `${r.code} bounced: the installment is due again.` },
      )
      if (!res.error) setAsking(null)
      router.refresh()
    })
  const mark = async (r, status) => {
    if (!can.chequesDirect) return setAsking({ receipt: r, status })
    if (status === "bounced" && !(await confirmBounce(r))) return
    send(r, status)
  }

  const columns = [
    {
      key: "date",
      header: "Date",
      sortValue: (r) => new Date(r.receivedOn).getTime(),
      cell: (r) => (
        <span className="whitespace-nowrap">
          {formatDateTime(r.receivedOn)}
          <span className="block font-mono text-[11px] text-muted-foreground">{r.code}</span>
        </span>
      ),
    },
    {
      key: "from",
      header: "Received from",
      sortValue: (r) => r.booking.buyer.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link href={bookingHref(r.booking.code)} className="block truncate font-medium hover:text-primary">
            {r.booking.buyer}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {r.booking.unit} · {r.booking.project.name}
          </span>
        </div>
      ),
    },
    { key: "for", header: "For", sortValue: (r) => r.notes, cell: (r) => <span className="block max-w-56 truncate text-muted-foreground">{r.notes || "—"}</span> },
    {
      key: "method",
      header: "Method",
      sortValue: (r) => r.method,
      cell: (r) => (
        <span className="min-w-0">
          <MethodText method={r.method} />
          {(r.chequeNo || r.reference) && <span className="block truncate text-xs text-muted-foreground">{r.chequeNo ? `Cheque ${r.chequeNo}${r.chequeBank ? ` · ${r.chequeBank}` : ""}` : r.reference}</span>}
          <ProofLink proof={r.proof} />
        </span>
      ),
    },
    { key: "amount", header: "Amount", className: "text-right whitespace-nowrap tabular-nums", sortValue: (r) => r.amount, cell: (r) => formatPkr(r.amount) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <ReceiptBadge status={r.status} /> },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            align="end"
            items={[
              { label: "Open booking", icon: "arrow-right-line", onClick: () => router.push(bookingHref(r.booking.code)) },
              ...(r.status === "clearing" && can.cheques
                ? [
                    { type: "separator" },
                    { label: can.chequesDirect ? "Cheque cleared" : "Request clear", icon: "checkbox-circle-line", onClick: () => mark(r, "cleared") },
                    { label: can.chequesDirect ? "Cheque bounced" : "Request bounce", icon: "close-circle-line", variant: "destructive", onClick: () => mark(r, "bounced") },
                  ]
                : []),
            ]}
            trigger={<IconButton icon="more-2-line" aria-label="Actions" tooltip={false} disabled={pending} />}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Receipts"
        description="Payments received, cheques in clearing and bounced cheques"
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search receipts" placeholder="Receipt, cheque, buyer or booking…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={<ToggleGroup aria-label="Period" value={period} onChange={(v) => v && setPeriod(v)} options={Object.entries(PERIODS).map(([value, label]) => ({ value, label }))} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="wallet-3-line" tone="green" label="Collected" value={formatPkr(total)} hint={`${cleared.length} payments · ${PERIODS[period].toLowerCase()}`} />
        <StatTile icon="time-line" tone="amber" label="Cheques in clearing" value={formatPkr(clearing.reduce((s, r) => s + r.amount, 0))} hint={`${clearing.length} waiting`} />
        <StatTile icon="close-circle-line" tone="red" label="Bounced" value={scoped.filter((r) => r.status === "bounced").length} hint={PERIODS[period].toLowerCase()} />
        <StatTile icon="smartphone-line" tone="sky" label="Paid digitally" value={total ? `${Math.round((digital / total) * 100)}%` : "—"} hint="Bank transfer and wallets" />
      </div>
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.code}
          minWidth="62rem"
          onRowClick={(r) => router.push(bookingHref(r.booking.code))}
          defaultSort={{ key: "date", dir: "desc" }}
          empty={<p className={cn("text-sm text-muted-foreground")}>No receipts {period === "all" ? "yet" : "in this period"}.</p>}
        />
      </div>
      {asking && (
        <ApprovalReasonDialog
          title={`Request to mark ${asking.receipt.chequeNo ? `cheque ${asking.receipt.chequeNo}` : asking.receipt.code} ${asking.status}`}
          description={`Your role can't clear or bounce cheques. Someone who can gets this in their Approvals inbox; ${asking.status === "cleared" ? "it counts once they approve" : "the installment is due again once they approve"}.`}
          placeholder={asking.status === "cleared" ? "e.g. Showing in the bank statement today." : "e.g. Returned by the bank: insufficient funds."}
          onSend={(reason) => send(asking.receipt, asking.status, reason)}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}
