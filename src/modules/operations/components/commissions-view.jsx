"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { urlCode } from "@/lib/url"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { useList } from "@/modules/lookups/context"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { markCommissionRecovered, payCommissions, setCommissionPct } from "../server/commission-actions"
import { PayoutVoucher } from "./documents"
import { CommissionBadge, MethodText } from "./sales-parts"

// Sales › Commissions: what dealers and agents earned on bookings, what's payable now, payouts
// (with tax withheld from dealers) and what to recover after cancellations.
//   rows: commissionRows() · payouts: listPayouts() · canPay: sales.pay-commissions
//   level: own | all (sales.commissions) · trigger: when commission becomes payable

const TRIGGER = { token: "once the token is received", "down-payment": "once the down payment is in", allotment: "once the allotment letter is issued" }
const today = () => new Date().toISOString().slice(0, 10)
// Pakistan's tax year starts on 1 July
const taxYearStart = () => {
  const d = new Date()
  return new Date(d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1, 6, 1)
}

function Figure({ label, value, note, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</span>
        {note && <span className="truncate text-[13px] text-muted-foreground">{note}</span>}
      </div>
    </div>
  )
}

function Partner({ p }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {p.type === "dealer" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
          <Icon name="shake-hands-line" />
        </span>
      ) : (
        <Avatar name={p.name} source={p.avatarUrl} size="sm" />
      )}
      <span className="min-w-0">
        <span className="block truncate">{p.name}</span>
        <span className="block text-xs text-muted-foreground">{p.type === "dealer" ? "Dealer" : "Agent"}</span>
      </span>
    </span>
  )
}

// Pay the chosen commissions: one payout per partner, tax withheld on dealers
// direct: may pay (operations.pay-commissions); otherwise the payout is sent for approval
function PayDialog({ rows, accounts, whtPct: defaultWht, direct = true, onClose, onPaid }) {
  const methods = useList("payment-method")
  const [form, setForm] = useState(() => ({ paidOn: today(), method: "bank-transfer", account: accounts.find((a) => a.isDefault)?.code ?? accounts[0]?.code ?? "", reference: "", whtPct: defaultWht, notes: "" }))
  const [errors, setErrors] = useState({})
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const groups = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.partner.key, [...(m.get(r.partner.key) ?? []), r])
    return [...m.values()].map((list) => {
      const gross = list.reduce((s, r) => s + r.amount, 0)
      const wht = list[0].partner.type === "dealer" ? Math.round((gross * (form.whtPct || 0)) / 100) : 0
      return { partner: list[0].partner, count: list.length, gross, wht, net: gross - wht }
    })
  }, [rows, form.whtPct])
  const total = groups.reduce((s, g) => s + g.net, 0)
  const hasDealer = groups.some((g) => g.partner.type === "dealer")
  const pay = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => payCommissions({ ...form, bookings: rows.map((x) => x.code) }, reason), {
        loading: direct ? "Recording payout…" : "Sending…",
        success: (res) => (res.pending ? SENT_FOR_APPROVAL : `Paid: ${res.codes.join(", ")}.`),
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (!r?.error) onPaid()
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={direct ? "Pay commission" : "Request commission payout"}
      description={`${rows.length} ${rows.length === 1 ? "booking" : "bookings"}, ${groups.length} ${groups.length === 1 ? "payout" : "payouts"} (one per partner).`}
      footer={
        <>
          <span className="mr-auto self-center text-sm">
            Net to pay <span className="font-semibold tabular-nums">{formatPkr(total)}</span>
          </span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={direct ? "check-line" : "send-plane-line"} loading={pending} onClick={pay}>
            {direct ? "Record payout" : "Send for approval"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Partner</th>
                <th className="px-3 py-2 text-right font-medium">Bookings</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">Tax withheld</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((g) => (
                <tr key={g.partner.key}>
                  <td className="px-3 py-2">
                    <Partner p={g.partner} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPkr(g.gross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.wht ? `− ${formatPkr(g.wht)}` : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatPkr(g.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker label="Paid on" required clearable={false} value={form.paidOn} onChange={(v) => set({ paidOn: v || today() })} error={errors.paidOn} />
          <Select label="Paid by" value={form.method} onChange={(v) => set({ method: v })} options={methods.options} error={errors.method} />
          {accounts.length > 0 && (
            <Select
              label="From account"
              value={form.account}
              onChange={(v) => set({ account: v })}
              options={accounts.map((a) => ({ value: a.code, label: [a.name, a.bankName].filter(Boolean).join(" · ") }))}
              error={errors.account}
            />
          )}
          <Input label="Cheque no. or reference" value={form.reference} onChange={(e) => set({ reference: e.target.value })} error={errors.reference} />
          {hasDealer && (
            <NumberInput
              label="Tax withheld on dealers"
              info="Income tax deducted at source on commission (section 233)"
              min={0}
              max={50}
              step={0.5}
              suffix="%"
              value={form.whtPct}
              onChange={(n) => set({ whtPct: n ?? 0 })}
              error={errors.whtPct}
            />
          )}
          <Input label="Notes" className="sm:col-span-2" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {!direct && <Textarea label="Note for the approver (optional)" rows={2} maxLength={300} placeholder="e.g. Dealer's invoice received and checked." value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Dialog>
  )
}

function RateDialog({ row, onClose, onSaved }) {
  const [pct, setPct] = useState(row.pct)
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => setCommissionPct(row.code, pct), { loading: "Saving…", success: `${row.code}: commission ${pct}%.` })
      if (!r?.error) onSaved()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-sm"
      title="Commission rate"
      description={`${row.code} · ${row.partner.name} · net price ${formatPkr(row.net)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <NumberInput label="Rate" min={0} max={20} step={0.25} suffix="%" value={pct} onChange={(n) => setPct(n ?? 0)} />
      <p className="text-sm text-muted-foreground">
        Commission: <span className="font-medium text-foreground tabular-nums">{formatPkr(Math.round((row.net * (pct || 0)) / 100))}</span>
      </p>
    </Dialog>
  )
}

//   canPay: may pay or ask for a payout · payDirect: operations.pay-commissions (otherwise payouts go to Approvals)
export function CommissionsView({ rows, payouts, accounts, whtPct, trigger, canPay, payDirect = canPay, level, brand, initialTab }) {
  const router = useRouter()
  const methods = useList("payment-method")
  const [tab, setTab] = useState(["partners", "commissions", "payouts"].includes(initialTab) ? initialTab : level === "own" ? "commissions" : "partners")
  const [view, setView] = useState("payable")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ type: [], project: [] })
  const [selected, setSelected] = useState(() => new Set())
  const [paying, setPaying] = useState(null) // rows to pay
  const [rate, setRate] = useState(null)
  const [voucher, setVoucher] = useState(null)
  const [, startTransition] = useTransition()

  const projects = useMemo(() => [...new Map(rows.map((r) => [r.project.code, r.project])).values()], [rows])
  const groups = [
    {
      key: "type",
      label: "Partner",
      icon: "shake-hands-line",
      options: [
        { value: "dealer", label: "Dealers" },
        { value: "agent", label: "Agents" },
      ],
    },
    { key: "project", label: "Project", icon: "community-line", options: projects.map((p) => ({ value: p.code, label: p.name })) },
  ]
  const term = q.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (!filters.type.length || filters.type.includes(r.partner.type)) &&
      (!filters.project.length || filters.project.includes(r.project.code)) &&
      (!term || [r.code, r.buyer, r.partner.name, r.unit].some((v) => v?.toLowerCase().includes(term))),
  )

  // Figures
  const sum = (list) => list.reduce((s, r) => s + r.amount, 0)
  const since = taxYearStart()
  const yearPayouts = payouts.filter((p) => new Date(p.paidOn) >= since)
  const figures = {
    payable: filtered.filter((r) => r.commission === "payable"),
    pending: filtered.filter((r) => r.commission === "pending"),
    clawback: filtered.filter((r) => r.commission === "clawback"),
  }

  const VIEWS = [
    { value: "payable", label: "Payable" },
    { value: "pending", label: "Waiting" },
    { value: "paid", label: "Paid" },
    { value: "clawback", label: "To recover" },
    { value: "all", label: "All" },
  ]
  const listRows = view === "all" ? filtered : filtered.filter((r) => r.commission === view)
  const payableSelected = rows.filter((r) => selected.has(r.code) && r.commission === "payable")

  const done = () => {
    setPaying(null)
    setRate(null)
    setSelected(new Set())
    router.refresh()
  }
  const recover = async (r) => {
    const ok = await confirm({
      title: `Mark ${formatPkr(r.amount)} recovered from ${r.partner.name}?`,
      description: `Record that the commission paid on ${r.code} has been paid back. This closes the clawback.`,
      confirmLabel: "Mark recovered",
      icon: "arrow-go-back-line",
    })
    if (!ok) return
    startTransition(async () => {
      const res = await toastAction(() => markCommissionRecovered(r.code), { loading: "Saving…", success: `Recovered from ${r.partner.name}.` })
      if (!res?.error) router.refresh()
    })
  }

  // By partner
  const partners = (() => {
    const m = new Map()
    for (const r of filtered) {
      const g = m.get(r.partner.key) ?? { partner: r.partner, bookings: 0, sales: 0, earned: 0, paid: 0, payable: 0, pending: 0, payableRows: [] }
      if (r.commission !== "void") {
        g.bookings += 1
        g.sales += r.net
        g.earned += r.commission === "clawback" || r.commission === "recovered" ? 0 : r.amount
      }
      if (r.commission === "paid") g.paid += r.amount
      if (r.commission === "payable") {
        g.payable += r.amount
        g.payableRows.push(r)
      }
      if (r.commission === "pending") g.pending += r.amount
      m.set(r.partner.key, g)
    }
    return [...m.values()].sort((a, b) => b.payable - a.payable || b.earned - a.earned)
  })()

  const commissionColumns = [
    {
      key: "booking",
      header: "Booking",
      sortValue: (r) => r.buyer?.toLowerCase() ?? "",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={`/operations/bookings/${urlCode(r.code)}`} className="block truncate font-medium hover:text-primary">
            {r.buyer}
          </Link>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{[r.code, r.project.name, r.unit].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    { key: "partner", header: "Partner", sortValue: (r) => r.partner.name, cell: (r) => <Partner p={r.partner} /> },
    { key: "net", header: "Net price", className: "text-right tabular-nums whitespace-nowrap", sortValue: (r) => r.net, cell: (r) => formatPkr(r.net) },
    { key: "pct", header: "Rate", className: "text-right tabular-nums", sortValue: (r) => r.pct, cell: (r) => `${r.pct}%` },
    { key: "amount", header: "Commission", className: "text-right font-medium tabular-nums whitespace-nowrap", sortValue: (r) => r.amount, cell: (r) => formatPkr(r.amount) },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.commission,
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <CommissionBadge status={r.commission} />
          {r.payout && <span className="text-xs text-muted-foreground tabular-nums">{[r.payout.code, formatDate(r.payout.paidOn)].join(" · ")}</span>}
        </span>
      ),
    },
    { key: "booked", header: "Booked", className: "whitespace-nowrap text-muted-foreground", sortValue: (r) => new Date(r.bookedAt).getTime(), cell: (r) => formatDate(r.bookedAt) },
    ...(canPay
      ? [
          {
            key: "actions",
            header: "",
            cell: (r) =>
              (payDirect ? ["pending", "payable", "clawback"] : ["payable"]).includes(r.commission) && (
                <DropdownMenu
                  align="end"
                  items={[
                    ...(r.commission === "payable" ? [{ label: payDirect ? "Pay" : "Request payout", icon: "hand-coin-line", onClick: () => setPaying([r]) }] : []),
                    ...(payDirect && r.commission !== "clawback" ? [{ label: "Change rate", icon: "percent-line", onClick: () => setRate(r) }] : []),
                    ...(payDirect && r.commission === "clawback" ? [{ label: "Mark recovered", icon: "arrow-go-back-line", onClick: () => recover(r) }] : []),
                  ]}
                  trigger={
                    <button
                      type="button"
                      aria-label="Commission actions"
                      onClick={(e) => e.stopPropagation()}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Icon name="more-2-line" />
                    </button>
                  }
                />
              ),
          },
        ]
      : []),
  ]

  const tabs = [
    ...(level === "all"
      ? [
          {
            value: "partners",
            label: "By partner",
            icon: "team-line",
            count: partners.length || null,
            content: (
              <DataTable
                columns={[
                  { key: "partner", header: "Partner", sortValue: (g) => g.partner.name, cell: (g) => <Partner p={g.partner} /> },
                  { key: "bookings", header: "Bookings", className: "text-right tabular-nums", sortValue: (g) => g.bookings, cell: (g) => g.bookings },
                  { key: "sales", header: "Sales value", className: "text-right tabular-nums whitespace-nowrap", sortValue: (g) => g.sales, cell: (g) => formatPkr(g.sales) },
                  { key: "earned", header: "Earned", className: "text-right tabular-nums whitespace-nowrap", sortValue: (g) => g.earned, cell: (g) => formatPkr(g.earned) },
                  { key: "paid", header: "Paid", className: "text-right tabular-nums whitespace-nowrap", sortValue: (g) => g.paid, cell: (g) => formatPkr(g.paid) },
                  { key: "pending", header: "Waiting", className: "text-right tabular-nums whitespace-nowrap text-muted-foreground", sortValue: (g) => g.pending, cell: (g) => formatPkr(g.pending) },
                  {
                    key: "payable",
                    header: "Payable now",
                    className: "text-right tabular-nums whitespace-nowrap",
                    sortValue: (g) => g.payable,
                    cell: (g) => <span className={cn(g.payable > 0 && "font-semibold text-amber-700 dark:text-amber-400")}>{formatPkr(g.payable)}</span>,
                  },
                  ...(canPay
                    ? [
                        {
                          key: "pay",
                          header: "",
                          cell: (g) =>
                            g.payable > 0 && (
                              <Button size="sm" variant="outline" leftIcon="hand-coin-line" onClick={() => setPaying(g.payableRows)}>
                                {payDirect ? "Pay" : "Request"}
                              </Button>
                            ),
                        },
                      ]
                    : []),
                ]}
                rows={partners}
                rowKey={(g) => g.partner.key}
                minWidth="60rem"
                defaultSort={{ key: "payable", dir: "desc" }}
                empty={<p className="text-sm text-muted-foreground">No commissions yet.</p>}
              />
            ),
          },
        ]
      : []),
    {
      value: "commissions",
      label: "Commissions",
      icon: "percent-line",
      count: filtered.length || null,
      content: (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-control items-center rounded-lg bg-muted p-[3px]">
              {VIEWS.map((v) => {
                const n = v.value === "all" ? filtered.length : filtered.filter((r) => r.commission === v.value).length
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setView(v.value)}
                    className={cn(
                      "inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap",
                      view === v.value ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground",
                    )}
                  >
                    {v.label}
                    <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
                  </button>
                )
              })}
            </div>
            {canPay && payableSelected.length > 0 && (
              <Button className="ml-auto" leftIcon="hand-coin-line" onClick={() => setPaying(payableSelected)}>
                {payDirect ? "Pay" : "Request payout for"} {payableSelected.length} selected · {formatPkr(sum(payableSelected))}
              </Button>
            )}
          </div>
          <DataTable
            columns={commissionColumns}
            rows={listRows}
            rowKey={(r) => r.code}
            minWidth="68rem"
            defaultSort={{ key: "booked", dir: "desc" }}
            {...(canPay && view === "payable" ? { selectedIds: selected, onSelectionChange: setSelected } : {})}
            empty={<p className="text-sm text-muted-foreground">Nothing here.</p>}
          />
        </div>
      ),
    },
    {
      value: "payouts",
      label: "Payouts",
      icon: "file-list-3-line",
      count: payouts.length || null,
      content: (
        <DataTable
          columns={[
            {
              key: "code",
              header: "Payout",
              sortValue: (p) => new Date(p.paidOn).getTime(),
              cell: (p) => (
                <div>
                  <span className="block font-medium tabular-nums">{p.code}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(p.paidOn)}</span>
                </div>
              ),
            },
            { key: "partner", header: "Paid to", sortValue: (p) => p.partner.name, cell: (p) => <Partner p={p.partner} /> },
            { key: "count", header: "Bookings", className: "text-right tabular-nums", sortValue: (p) => p.items.length, cell: (p) => p.items.length },
            { key: "gross", header: "Gross", className: "text-right tabular-nums whitespace-nowrap", sortValue: (p) => p.gross, cell: (p) => formatPkr(p.gross) },
            { key: "wht", header: "Tax withheld", className: "text-right tabular-nums whitespace-nowrap", sortValue: (p) => p.wht, cell: (p) => (p.wht ? `${formatPkr(p.wht)} (${p.whtPct}%)` : "—") },
            { key: "net", header: "Net paid", className: "text-right font-medium tabular-nums whitespace-nowrap", sortValue: (p) => p.net, cell: (p) => formatPkr(p.net) },
            {
              key: "method",
              header: "Paid by",
              cell: (p) => (
                <span className="text-sm">
                  <MethodText method={p.method} />
                  {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                </span>
              ),
            },
            {
              key: "print",
              header: "",
              cell: (p) => (
                <Button size="sm" variant="ghost" leftIcon="printer-line" onClick={() => setVoucher(p)}>
                  Voucher
                </Button>
              ),
            },
          ]}
          rows={payouts}
          rowKey={(p) => p.code}
          minWidth="60rem"
          defaultSort={{ key: "code", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">No payouts yet.</p>}
        />
      ),
    },
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Commissions"
        description={`Dealers and agents earn on what they sell, payable ${TRIGGER[trigger] ?? ""}.`}
        toolbar={
          <>
            <div className="w-full max-w-72">
              <Input type="search" aria-label="Search commissions" placeholder="Partner, buyer or booking…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />

      <section className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-background px-4 py-3 shadow-xs md:grid-cols-5">
        <Figure label="Payable now" value={formatPkr(sum(figures.payable))} tone="text-amber-700 dark:text-amber-400" note={`${figures.payable.length}`} />
        <Figure label="Waiting" value={formatPkr(sum(figures.pending))} note={`${figures.pending.length}`} />
        <Figure label="Paid this tax year" value={formatPkr(yearPayouts.reduce((s, p) => s + p.net, 0))} note="net" />
        <Figure label="Tax withheld" value={formatPkr(yearPayouts.reduce((s, p) => s + p.wht, 0))} note="since 1 July" />
        <Figure
          label="To recover"
          value={formatPkr(sum(figures.clawback))}
          tone={figures.clawback.length ? "text-red-600 dark:text-red-400" : undefined}
          note={figures.clawback.length ? `${figures.clawback.length}` : null}
        />
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {paying && <PayDialog rows={paying} accounts={accounts} whtPct={whtPct} direct={payDirect} onClose={() => setPaying(null)} onPaid={done} />}
      {rate && <RateDialog row={rate} onClose={() => setRate(null)} onSaved={done} />}
      {voucher && (
        <PrintPreviewDialog title={`Payout voucher ${voucher.code}`} printUrl={`/operations/commissions/print?payout=${urlCode(voucher.code)}`} onClose={() => setVoucher(null)}>
          <PayoutVoucher payout={voucher} brand={brand} methodLabel={methods.label} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}

// The voucher alone on the page, printing itself on load
export function PayoutPrint({ payout, brand }) {
  const methods = useList("payment-method")
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <PayoutVoucher payout={payout} brand={brand} methodLabel={methods.label} />
      <PrintOnLoad />
    </div>
  )
}
