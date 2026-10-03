"use client"

import { useMemo, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { paymentSchedule, planSummary } from "@/modules/portfolio/pricing"
import { Button } from "@/components/ui/button"
import { DatePicker, DateTimePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { cancelBooking, recordReceipt, saveBookingBuyer, setBookingPlan } from "../server/bookings"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { ProofPicker, proofForm } from "./sales-parts"

// The dialogs on a booking: payment plan, buyer details (KYC), record a payment, cancel.
// Each calls onDone(message) after saving.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
// Now in Pakistan time, as the date-time picker's value ("2026-10-03T14:30")
const nowPk = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(" ", "T")
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`

function useSave(onDone) {
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const save = (fn, message) =>
    startTransition(async () => {
      setErrors({})
      setError("")
      const r = await fn()
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.error) setError(r.error)
      else onDone(typeof message === "function" ? message(r) : message)
    })
  return { pending, errors, error, save }
}

function Footer({ onClose, pending, label, icon = "check-line", onClick, disabled, destructive }) {
  return (
    <>
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button variant={destructive ? "destructive" : "default"} leftIcon={icon} loading={pending} disabled={disabled} onClick={onClick}>
        {label}
      </Button>
    </>
  )
}

// ---------- payment plan ----------

export function PlanDialog({ booking: b, discountLimit, onClose, onDone }) {
  const [planKey, setPlanKey] = useState(b.plan?.key ?? b.plans[0]?.key ?? "")
  const [extra, setExtra] = useState(b.extraDiscount || null)
  const [start, setStart] = useState(b.planStart ?? today())
  const { pending, errors, error, save } = useSave(onDone)
  const plan = b.plans.find((p) => p.key === planKey)
  const limit = Math.round((b.agreedPrice * (discountLimit ?? 0)) / 100)
  const preview = useMemo(() => (plan ? paymentSchedule(b.agreedPrice - (extra || 0), plan, new Date(`${start}T00:00:00`)) : null), [plan, b.agreedPrice, extra, start])
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={b.plan ? "Change payment plan" : "Set up the payment plan"}
      description={`From ${b.priceListName ?? "the project's price list"}. Money already received counts towards the first lines.`}
      footer={
        <Footer
          onClose={onClose}
          pending={pending}
          label={b.plan ? "Save plan" : "Set up plan"}
          disabled={!plan}
          onClick={() => save(() => setBookingPlan(b.code, { planKey, extraDiscount: extra || 0, start }), `Payment plan set: ${plan.name}.`)}
        />
      }
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        {!b.plans.length ? (
          <Notice tone="error">This project has no active price list with payment plans. Activate one in Project Portfolio › Price Lists.</Notice>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {b.plans.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlanKey(p.key)}
                className={cn("cursor-pointer rounded-xl border p-3 text-left transition-colors", p.key === planKey ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/40")}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className={cn("flex size-4 items-center justify-center rounded-full border", p.key === planKey && "border-primary")}>
                    {p.key === planKey && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  {p.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{planSummary(p)}</span>
              </button>
            ))}
          </div>
        )}
        {errors.planKey && <p className="text-xs text-destructive">{errors.planKey}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker label="Plan starts" value={start} onChange={(v) => v && setStart(v)} clearable={false} error={errors.start} />
          {limit > 0 ? (
            <NumberInput label={`Extra discount (up to ${discountLimit}%: ${formatPkr(limit)})`} prefix="Rs" min={0} max={limit} placeholder="None" value={extra} onChange={setExtra} error={errors.extraDiscount} />
          ) : (
            <p className="self-end pb-2 text-xs text-muted-foreground">Your role can&apos;t give extra discount.</p>
          )}
        </div>
        {preview && (
          <div className="rounded-xl border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5 text-sm">
              <span className="font-medium">
                {preview.rows.length} {preview.rows.length === 1 ? "payment" : "payments"}
              </span>
              <span className="tabular-nums">
                Net <span className="font-semibold">{rs(preview.net)}</span>
                {preview.discount + (extra || 0) > 0 && <span className="text-muted-foreground"> · {rs(preview.discount + (extra || 0))} discount</span>}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {preview.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-4 py-1.5">{r.label}</td>
                      <td className="px-4 py-1.5 text-muted-foreground tabular-nums">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{rs(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ---------- buyer details (KYC) ----------

const formatCnic = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 13)
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join("-")
}
const RELATIONS = ["Wife", "Husband", "Son", "Daughter", "Father", "Mother", "Brother", "Sister"].map((r) => ({ value: r, label: r }))

export function BuyerDialog({ booking: b, onClose, onDone }) {
  const p = b.buyerDetails
  const [form, setForm] = useState({
    name: p.name ?? "",
    email: p.email ?? "",
    cnic: p.hasCnic && !String(p.cnic).includes("•") ? p.cnic : "",
    guardianRelation: p.guardianRelation ?? "S/O",
    guardianName: p.guardianName ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    nominee: { name: b.nominee?.name ?? "", relation: b.nominee?.relation ?? "", cnic: b.nominee?.cnic ?? "" },
  })
  const { pending, errors, error, save } = useSave(onDone)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setNominee = (patch) => setForm((f) => ({ ...f, nominee: { ...f.nominee, ...patch } }))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title="Buyer details"
      description="As on the buyer's CNIC. They go on the allotment letter and receipts."
      footer={<Footer onClose={onClose} pending={pending} label="Save details" onClick={() => save(() => saveBookingBuyer(b.code, form), "Buyer details saved.")} />}
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        {p.hasCnic && String(p.cnic).includes("•") && <Notice tone="error">Your role can&apos;t see full CNIC numbers, so re-enter it to save changes.</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name as on CNIC" required value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          <Input label="CNIC" required inputMode="numeric" placeholder="35202-1234567-1" value={form.cnic} onChange={(e) => set({ cnic: formatCnic(e.target.value) })} error={errors.cnic} />
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 sm:col-span-2">
            <Select label="Relation" value={form.guardianRelation} onChange={(v) => set({ guardianRelation: v })} options={["S/O", "D/O", "W/O"].map((v) => ({ value: v, label: v }))} />
            <Input label="Father's / husband's name" required value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} error={errors.guardianName} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Postal address" required value={form.address} onChange={(e) => set({ address: e.target.value })} error={errors.address} />
          </div>
          <Input label="City" value={form.city} onChange={(e) => set({ city: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
        </div>
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Nominee (optional)</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Name" value={form.nominee.name} onChange={(e) => setNominee({ name: e.target.value })} />
            <Select label="Relation" placeholder="Pick" value={form.nominee.relation} onChange={(v) => setNominee({ relation: v })} options={RELATIONS} />
            <Input label="CNIC" inputMode="numeric" placeholder="35202-1234567-1" value={form.nominee.cnic} onChange={(e) => setNominee({ cnic: formatCnic(e.target.value) })} error={errors["nominee.cnic"]} />
          </div>
        </fieldset>
      </div>
    </Dialog>
  )
}

// ---------- record a payment ----------

const REF_LABEL = { cash: "Receipt book no.", "pay-order": "Pay order no.", "bank-transfer": "Transaction ID", jazzcash: "Transaction ID", easypaisa: "Transaction ID" }

// direct: records it at once (operations.receipts); otherwise it's sent for approval with an optional note
export function ReceiptDialog({ booking: b, line = null, direct = true, onClose, onDone }) {
  const methods = useList("payment-method")
  const suggested = line ? line.balance : b.overdueAmount || b.nextDue?.balance || b.balance
  const [form, setForm] = useState({
    amount: Math.round(Math.min(suggested, b.balance - b.clearing)) || null,
    method: methods.options[0]?.value ?? "bank-transfer",
    receivedOn: nowPk(),
    accountId: b.accounts.find((a) => a.isDefault)?.id ?? b.accounts[0]?.id ?? null,
    reference: "",
    chequeNo: "",
    chequeBank: "",
    chequeDate: "",
    notes: line ? line.label : "",
  })
  const [proof, setProof] = useState(null)
  const [reason, setReason] = useState("")
  const { pending, errors, error, save } = useSave(onDone)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const cheque = form.method === "cheque"
  const accounts = b.accounts.filter((a) => (form.method === "cash" ? a.kind === "cash" : a.kind === "bank"))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-xl"
      title="Record a payment"
      description={
        direct
          ? `${b.buyer.name} · ${b.code}. Payments go to the oldest unpaid installment first.`
          : `${b.buyer.name} · ${b.code}. Your role can't record payments directly: it goes to Approvals and counts once approved.`
      }
      footer={
        <Footer
          onClose={onClose}
          pending={pending}
          label={direct ? "Record payment" : "Send for approval"}
          icon={direct ? "money-dollar-circle-line" : "send-plane-line"}
          onClick={() =>
            save(
              () => recordReceipt(b.code, direct ? form : { ...form, reason }, proofForm(proof)),
              (r) => (r.pending ? SENT_FOR_APPROVAL : `Payment recorded (${r.receipt}).${cheque || form.method === "pay-order" ? " It counts once it clears." : ""}`),
            )
          }
        />
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="Amount" required prefix="Rs" min={1} value={form.amount} onChange={(v) => set({ amount: v })} error={errors.amount} />
          <DateTimePicker label="Received on" value={form.receivedOn} maxDate={today()} onChange={(v) => v && set({ receivedOn: v })} clearable={false} error={errors.receivedOn} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Paid by</p>
          <ToggleGroup
            aria-label="Paid by"
            value={form.method}
            onChange={(v) => v && set({ method: v, accountId: b.accounts.find((a) => (v === "cash" ? a.kind === "cash" : a.kind === "bank"))?.id ?? null })}
            options={methods.options.map((o) => ({ value: o.value, label: o.label.replace(/ \(.*\)$/, "") }))}
            className="flex-wrap"
          />
          {errors.method && <p className="text-xs text-destructive">{errors.method}</p>}
        </div>
        {cheque ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Cheque no." required value={form.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} error={errors.chequeNo} />
            <Input label="Bank" placeholder="e.g. HBL" value={form.chequeBank} onChange={(e) => set({ chequeBank: e.target.value })} />
            <DatePicker label="Cheque date" value={form.chequeDate} onChange={(v) => set({ chequeDate: v ?? "" })} />
          </div>
        ) : (
          <Input label={REF_LABEL[form.method] ?? "Reference"} value={form.reference} onChange={(e) => set({ reference: e.target.value })} />
        )}
        {accounts.length > 0 && (
          <Select
            label={form.method === "cash" ? "Cash account" : "Deposited into"}
            value={form.accountId ? String(form.accountId) : ""}
            onChange={(v) => set({ accountId: Number(v) })}
            options={accounts.map((a) => ({ value: String(a.id), label: [a.name, a.bankName].filter(Boolean).join(" · ") }))}
            error={errors.accountId}
          />
        )}
        <Input label="For (optional)" placeholder="e.g. Installment 4, down payment" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        <ProofPicker value={proof} onChange={setProof} error={errors.proof} />
        {!direct && <Textarea label="Note for the approver (optional)" rows={2} maxLength={300} placeholder="e.g. Deposit slip checked at the counter." value={reason} onChange={(e) => setReason(e.target.value)} />}
        {(cheque || form.method === "pay-order") && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Icon name="information-line" className="mt-0.5 shrink-0" />
            It waits in clearing and counts once someone marks it cleared (Receipts).
          </p>
        )}
      </div>
    </Dialog>
  )
}

// ---------- cancel ----------

// direct: cancels at once (operations.cancel); otherwise the cancellation is sent for approval
export function CancelDialog({ booking: b, direct = true, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [pct, setPct] = useState("10")
  const { pending, errors, error, save } = useSave(onDone)
  const deduction = Math.round((b.received * Number(pct)) / 100)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title={direct ? `Cancel ${b.code}?` : `Request to cancel ${b.code}`}
      description={
        direct
          ? "The unit goes back on sale and the buyer is refunded what they paid, less the deduction."
          : "Your role can't cancel bookings directly. Someone who can approves it from their Approvals inbox; then the unit goes back on sale and the refund is due."
      }
      footer={
        <Footer
          onClose={onClose}
          pending={pending}
          destructive
          icon={direct ? "close-circle-line" : "send-plane-line"}
          label={direct ? "Cancel booking" : "Send for approval"}
          disabled={reason.trim().length < 5}
          onClick={() =>
            save(
              () => cancelBooking(b.code, { reason, deductionPct: Number(pct) }),
              (r) => (r.pending ? SENT_FOR_APPROVAL : `Booking canceled. Refund due: ${rs(r.refund)}.`),
            )
          }
        />
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Textarea label="Why" required rows={3} placeholder="e.g. Buyer asked to cancel; couldn't arrange the down payment" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <Select label="Deduction" value={pct} onChange={setPct} options={["0", "10", "20", "25"].map((v) => ({ value: v, label: `${v}% of the amount received` }))} />
        <dl className="space-y-1 rounded-lg border p-3 text-sm">
          {[
            ["Received", rs(b.received)],
            ["Deduction", rs(deduction)],
            ["Refund to buyer", rs(b.received - deduction)],
          ].map(([k, v], i) => (
            <div key={k} className={cn("flex justify-between", i === 2 && "border-t pt-1 font-semibold")}>
              <dt className={i < 2 ? "text-muted-foreground" : undefined}>{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  )
}
