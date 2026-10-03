"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { amountInWords, formatDate, formatDateTime } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ACCOUNTS, VOUCHER_TYPES, figure, voucherTypeFor } from "../constants"
import { createVoucher, voidVoucher } from "../server/actions"
import { loadVoucher } from "../server/account-actions"
import { SourceLink, VoucherStatusBadge, VoucherTypeBadge, partyLabel, rupees } from "./finance-parts"
import { VoucherDocument, voucherCash } from "./finance-documents"

// Finance's voucher dialogs: viewing one (with print and void) and entering a new one.

const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
const accountOption = (a) => ({ value: a.id, label: `${a.code} · ${a.name}`, description: a.description || undefined })
const voucherHref = (code) => `/finance/vouchers?open=${urlCode(code)}`
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ---------- view ----------

function Fact({ label, children }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children || "—"}</dd>
    </div>
  )
}

// A voucher, printable; manual posted ones can be voided with a reason (canVoid: finance.void).
//   voucher: getVoucher() · brand: getWorkspaceBrand() · onChanged(): after voiding
export function VoucherDialog({ voucher: v, brand, canVoid = false, onClose, onChanged }) {
  const [mode, setMode] = useState(null) // print | void
  if (mode === "print")
    return (
      <PrintPreviewDialog title={`${VOUCHER_TYPES[v.type]?.label} ${v.code}`} printUrl={`/finance/vouchers/${urlCode(v.code)}/print`} pdfUrl={`/api/finance/vouchers/${urlCode(v.code)}/pdf`} onClose={() => setMode(null)}>
        <VoucherDocument v={v} brand={brand} />
      </PrintPreviewDialog>
    )
  if (mode === "void") return <VoidDialog voucher={v} onClose={() => setMode(null)} onDone={onChanged} />
  const voidable = canVoid && v.status === "posted" && v.source === "manual" && !v.isReversal && !v.reversedBy
  const cash = voucherCash(v)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <VoucherTypeBadge type={v.type} /> <span className="font-mono">{v.code}</span> <VoucherStatusBadge status={v.status} />
        </span>
      }
      description={v.narration}
      footer={
        <>
          {voidable && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" leftIcon="close-circle-line" onClick={() => setMode("void")}>
              Void
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button leftIcon="printer-line" onClick={() => setMode("print")}>
            Print
          </Button>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Fact label="Date">{formatDate(v.date)}</Fact>
        <Fact label={partyLabel(v.type)}>{v.party || v.vendor?.name}</Fact>
        <Fact label="Project">{v.project?.name ?? "Head office"}</Fact>
        <Fact label="Reference">{[v.reference, v.chequeNo && `Cheque ${v.chequeNo}`].filter(Boolean).join(" · ")}</Fact>
        <Fact label="From">{v.source === "manual" ? `Entered by ${v.createdBy ?? "Finance"}` : <SourceLink voucher={v} />}</Fact>
        <Fact label={v.status === "pending" ? "Status" : "Approved by"}>{v.status === "pending" ? "Waiting in Approvals" : v.approvedBy}</Fact>
      </dl>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {v.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <Link href={`/finance/accounts/${urlCode(l.account)}`} className="hover:text-primary hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{l.account}</span> {l.accountName}
                  </Link>
                  {l.memo && <span className="block text-xs text-muted-foreground">{l.memo}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{figure(l.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{figure(l.credit)}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{figure(v.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{figure(v.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {rupees(cash)} · <span className="italic">{amountInWords(cash)}</span>
      </p>
      {(v.status === "void" || v.reversalOf || v.reversedBy) && (
        <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          {v.status === "void" && (
            <p>
              Voided{v.voidedBy ? ` by ${v.voidedBy}` : ""}
              {v.voidedAt ? ` on ${formatDateTime(v.voidedAt)}` : ""}
              {v.voidReason ? `: ${v.voidReason}` : ""}
            </p>
          )}
          {v.reversedBy && (
            <p>
              Reversed by{" "}
              <Link href={voucherHref(v.reversedBy)} className="font-mono text-primary hover:underline">
                {v.reversedBy}
              </Link>
            </p>
          )}
          {v.reversalOf && (
            <p>
              Reverses{" "}
              <Link href={voucherHref(v.reversalOf)} className="font-mono text-primary hover:underline">
                {v.reversalOf}
              </Link>
            </p>
          )}
        </div>
      )}
      {v.status === "posted" && v.source !== "manual" && !v.isReversal && canVoid && (
        <p className="text-xs text-muted-foreground">Posted automatically. To undo it, change the record it came from (cancel the booking, bounce the cheque…).</p>
      )}
    </Dialog>
  )
}

// Open any voucher by code in the view dialog, loading it first (pages that list vouchers without
// their lines: the overview, statements) → { open(code), dialog }
export function useVoucherViewer({ brand, canVoid = false }) {
  const router = useRouter()
  const [voucher, setVoucher] = useState(null)
  const [, startTransition] = useTransition()
  const open = (code) =>
    startTransition(async () => {
      const r = await loadVoucher(code)
      if (r?.error) toast.error(r.error)
      else setVoucher(r.voucher)
    })
  const dialog = voucher && (
    <VoucherDialog
      voucher={voucher}
      brand={brand}
      canVoid={canVoid}
      onClose={() => setVoucher(null)}
      onChanged={() => {
        setVoucher(null)
        router.refresh()
      }}
    />
  )
  return { open, dialog }
}

function VoidDialog({ voucher: v, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const submit = () =>
    startTransition(async () => {
      const r = await toastAction(() => voidVoucher(v.code, reason), { loading: "Voiding…", success: (x) => `${v.code} voided. ${x.code} reverses it.` })
      if (r?.fieldErrors) setError(r.fieldErrors.reason ?? "Check the reason.")
      if (r?.ok) onDone?.(r)
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title={`Void ${v.code}?`}
      description={`A reversing journal is posted today for ${rupees(v.amount)}, and ${v.code} is marked void. This can't be undone.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="destructive" leftIcon="close-circle-line" loading={pending} onClick={submit}>
            Void voucher
          </Button>
        </>
      }
    >
      <Textarea
        label="Why is it voided?"
        required
        rows={3}
        autoFocus
        placeholder="e.g. Entered twice; the bill was paid on BPV-2627-00031"
        value={reason}
        error={error}
        onChange={(e) => {
          setReason(e.target.value)
          setError("")
        }}
      />
    </Dialog>
  )
}

// ---------- new vouchers ----------

const TITLES = {
  payment: ["New payment", "Money paid out of a cash or bank account: contractor bills, vendors, expenses."],
  receipt: ["New receipt", "Money received other than buyers' payments (those are received on their booking)."],
  transfer: ["Transfer between accounts", "Move money between your own cash and bank accounts: deposits, withdrawals, bank to bank."],
  journal: ["New journal voucher", "Adjustments, accruals and anything that isn't a payment or receipt."],
}

let lineSeq = 0
const blankLine = () => ({ key: ++lineSeq, accountId: null, debit: null, credit: null, memo: "" })

function initialForm(kind, form) {
  const money = form.accounts.filter((a) => a.kind)
  const from = form.defaultMoneyId ?? money[0]?.id ?? null
  return {
    date: pkToday(),
    projectId: "",
    reference: "",
    chequeNo: "",
    party: "",
    narration: "",
    reason: "",
    moneyAccountId: from,
    otherAccountId: kind === "receipt" ? (form.accounts.find((a) => a.code === ACCOUNTS.otherIncome)?.id ?? null) : kind === "transfer" ? (money.find((a) => a.id !== from)?.id ?? null) : null,
    amount: null,
    vendorId: null,
    whtPct: 0,
    lines: kind === "journal" ? [blankLine(), blankLine()] : [],
  }
}

// Enter a payment, receipt, transfer or journal.
//   kind: payment | receipt | transfer | journal
//   form: voucherFormData() → { accounts, vendors, projects, defaultMoneyId }
//   canPost: finance.approve (posts at once); without it the voucher waits in Approvals
//   onDone(result): { ok, code, pending }
export function NewVoucherDialog({ kind, form, canPost = false, onClose, onDone }) {
  const [initial] = useState(() => initialForm(kind, form))
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify({ ...f, lines: f.lines.map(({ key, ...l }) => l) }) !== JSON.stringify({ ...initial, lines: initial.lines.map(({ key, ...l }) => l) })
  useUnsavedGuard(dirty)

  const accountsById = useMemo(() => new Map(form.accounts.map((a) => [a.id, a])), [form.accounts])
  const money = form.accounts.filter((a) => a.kind)
  const others = form.accounts.filter((a) => !a.kind)
  const set = (patch) => {
    setF((x) => ({ ...x, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      delete next.form
      return next
    })
  }
  const setLine = (key, patch) => set({ lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })

  const moneyAcc = accountsById.get(f.moneyAccountId)
  const otherAcc = accountsById.get(f.otherAccountId)
  const bank = moneyAcc?.kind === "bank"
  const amount = Number(f.amount) || 0
  const wht = kind === "payment" ? Math.round((amount * (Number(f.whtPct) || 0)) / 100) : 0
  const debit = round2(f.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0))
  const credit = round2(f.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0))
  const balanced = debit === credit && debit > 0
  const type =
    kind === "payment"
      ? voucherTypeFor("out", moneyAcc?.kind)
      : kind === "receipt"
        ? voucherTypeFor("in", moneyAcc?.kind)
        : kind === "transfer"
          ? moneyAcc?.kind === "bank" || otherAcc?.kind === "bank"
            ? "bpv"
            : "cpv"
          : "jv"
  const vendor = form.vendors.find((x) => x.id === f.vendorId)

  const close = async () => {
    if (pending) return
    if (dirty && !(await confirm({ title: "Discard this voucher?", description: "What you've entered will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))) return
    onClose()
  }

  const submit = () =>
    startTransition(async () => {
      if (kind === "journal" && !balanced) return setErrors({ lines: debit ? `Debits and credits differ by ${rupees(Math.abs(debit - credit))}.` : "Enter the amounts." })
      const narration =
        f.narration.trim() ||
        (kind === "payment" && (vendor || f.party.trim()) ? `Payment to ${vendor?.name ?? f.party.trim()}` : kind === "transfer" && moneyAcc && otherAcc ? `Transfer from ${moneyAcc.name} to ${otherAcc.name}` : "")
      const input = {
        kind,
        date: f.date,
        narration,
        projectId: f.projectId || null,
        reference: f.reference,
        chequeNo: (kind === "payment" || kind === "transfer") && bank ? f.chequeNo : "",
        party: kind === "payment" && vendor ? "" : f.party,
        ...(kind === "journal"
          ? { lines: f.lines.filter((l) => l.accountId && (Number(l.debit) || Number(l.credit))).map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo })) }
          : { moneyAccountId: f.moneyAccountId, otherAccountId: f.otherAccountId, amount, vendorId: kind === "payment" ? f.vendorId : null, whtPct: kind === "payment" ? Number(f.whtPct) || 0 : 0 }),
      }
      const r = await toastAction(() => createVoucher(input, f.reason), {
        loading: canPost ? "Posting…" : "Sending for approval…",
        success: (x) => (x.pending ? `${x.code} is waiting in Approvals. It's posted once it's approved.` : `${x.code} posted.`),
      })
      if (r?.fieldErrors) {
        const fe = {}
        for (const [k, msg] of Object.entries(r.fieldErrors)) fe[k.startsWith("lines") ? "lines" : k] = msg
        setErrors(fe)
      } else if (r?.ok) onDone?.(r)
    })

  const [title, description] = TITLES[kind]
  const moneyOptions = money.map(accountOption)
  const projectOptions = [{ value: "", label: "Head office" }, ...form.projects.map((p) => ({ value: p.id, label: p.name }))]
  const amountInput = (label) => <NumberInput label={label} required prefix="Rs" min={0} step={1000} format={{ maximumFractionDigits: 2 }} value={f.amount} onChange={(v) => set({ amount: v })} error={errors.amount} />

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      scrollable
      className={kind === "journal" ? "sm:max-w-3xl" : "sm:max-w-xl"}
      title={title}
      description={description}
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            Posts as <VoucherTypeBadge type={type} />
          </span>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={canPost ? "check-line" : "send-plane-line"} loading={pending} disabled={kind === "journal" && !balanced} onClick={submit}>
            {canPost ? "Post voucher" : "Send for approval"}
          </Button>
        </>
      }
    >
      {kind === "payment" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Combobox
            label="Vendor"
            placeholder="Pick a vendor (optional)…"
            options={form.vendors.map((x) => ({ value: x.id, label: x.name, description: x.whtPct ? `Tax withheld ${x.whtPct}%` : "No tax withheld" }))}
            value={f.vendorId}
            error={errors.vendorId}
            onChange={(id) => {
              const x = form.vendors.find((y) => y.id === id)
              set({ vendorId: id ?? null, ...(x && { whtPct: x.whtPct, ...(x.accountId && accountsById.has(x.accountId) && !accountsById.get(x.accountId).kind && { otherAccountId: x.accountId }) }) })
            }}
          />
          {vendor ? (
            <Input label="Paid to" value={vendor.name} disabled />
          ) : (
            <Input label="Paid to" placeholder="Name of the person or business" value={f.party} onChange={(e) => set({ party: e.target.value })} error={errors.party} />
          )}
          <Select label="Pay from" required value={f.moneyAccountId} onChange={(v) => set({ moneyAccountId: v })} options={moneyOptions} error={errors.moneyAccountId} />
          <Combobox
            label="Expense or account"
            placeholder="What it's for…"
            options={others.map(accountOption)}
            value={f.otherAccountId}
            onChange={(v) => set({ otherAccountId: v ?? null })}
            error={errors.otherAccountId}
          />
          {amountInput("Amount (gross)")}
          <div>
            <NumberInput label="Income tax withheld" suffix="%" min={0} max={50} step={0.5} value={f.whtPct} onChange={(v) => set({ whtPct: v ?? 0 })} error={errors.whtPct} />
            <p className="mt-1 text-xs text-muted-foreground">Check the current rate for this kind of payment with your tax adviser.</p>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm sm:col-span-2">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Withheld (owed to FBR)</span> <span className="tabular-nums">{rupees(wht)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>Net paid</span> <span className="tabular-nums">{rupees(amount - wht)}</span>
            </p>
          </div>
        </div>
      )}
      {kind === "receipt" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Received from" value={f.party} onChange={(e) => set({ party: e.target.value })} error={errors.party} />
          <Select label="Received into" required value={f.moneyAccountId} onChange={(v) => set({ moneyAccountId: v })} options={moneyOptions} error={errors.moneyAccountId} />
          <Combobox label="Income or account" options={others.map(accountOption)} value={f.otherAccountId} onChange={(v) => set({ otherAccountId: v ?? null })} error={errors.otherAccountId} />
          {amountInput("Amount")}
        </div>
      )}
      {kind === "transfer" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="From" required value={f.moneyAccountId} onChange={(v) => set({ moneyAccountId: v })} options={moneyOptions} error={errors.moneyAccountId} />
          <Select label="To" required value={f.otherAccountId} onChange={(v) => set({ otherAccountId: v })} options={moneyOptions.filter((o) => o.value !== f.moneyAccountId)} error={errors.otherAccountId} />
          {amountInput("Amount")}
        </div>
      )}
      {kind === "journal" && (
        <div className="space-y-1">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Account</th>
                  <th className="w-36 px-2 py-2 text-right font-medium">Debit</th>
                  <th className="w-36 px-2 py-2 text-right font-medium">Credit</th>
                  <th className="px-2 py-2 text-left font-medium">Memo</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {f.lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="px-2 py-1.5">
                      <Combobox aria-label={`Line ${i + 1} account`} placeholder="Account…" options={form.accounts.map(accountOption)} value={l.accountId} onChange={(v) => setLine(l.key, { accountId: v ?? null })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumberInput
                        aria-label={`Line ${i + 1} debit`}
                        min={0}
                        step={1000}
                        showSteppers={false}
                        format={{ maximumFractionDigits: 2 }}
                        value={l.debit}
                        onChange={(v) => setLine(l.key, { debit: v, ...(v ? { credit: null } : {}) })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <NumberInput
                        aria-label={`Line ${i + 1} credit`}
                        min={0}
                        step={1000}
                        showSteppers={false}
                        format={{ maximumFractionDigits: 2 }}
                        value={l.credit}
                        onChange={(v) => setLine(l.key, { credit: v, ...(v ? { debit: null } : {}) })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input aria-label={`Line ${i + 1} memo`} value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} />
                    </td>
                    <td className="px-1 py-1.5">
                      {f.lines.length > 2 && <IconButton icon="delete-bin-6-line" aria-label={`Remove line ${i + 1}`} onClick={() => set({ lines: f.lines.filter((x) => x.key !== l.key) })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 text-sm">
                <tr>
                  <td className="px-2 py-2">
                    <Button size="sm" variant="ghost" leftIcon="add-line" onClick={() => set({ lines: [...f.lines, blankLine()] })}>
                      Add line
                    </Button>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{rupees(debit)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{rupees(credit)}</td>
                  <td colSpan={2} className={cn("px-2 py-2 text-xs", balanced ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {balanced ? (
                      <span className="flex items-center gap-1">
                        <Icon name="check-line" /> Balanced
                      </span>
                    ) : debit || credit ? (
                      `Difference ${rupees(Math.abs(debit - credit))}`
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {errors.lines && <p className="text-[13px] text-destructive">{errors.lines}</p>}
          <Input label="Party (optional)" value={f.party} onChange={(e) => set({ party: e.target.value })} error={errors.party} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <DatePicker label="Date" required value={f.date} onChange={(v) => set({ date: v || pkToday() })} clearable={false} error={errors.date} />
        <Select label="Project" value={f.projectId} onChange={(v) => set({ projectId: v })} options={projectOptions} error={errors.projectId} />
        {(kind === "payment" || kind === "transfer") && bank ? (
          <Input label="Cheque no." value={f.chequeNo} onChange={(e) => set({ chequeNo: e.target.value })} error={errors.chequeNo} />
        ) : (
          <Input label="Reference" value={f.reference} onChange={(e) => set({ reference: e.target.value })} error={errors.reference} />
        )}
      </div>
      {(kind === "payment" || kind === "transfer") && bank && <Input label="Reference" value={f.reference} onChange={(e) => set({ reference: e.target.value })} error={errors.reference} />}
      <Textarea
        label="Narration"
        rows={2}
        placeholder={kind === "payment" ? "e.g. Running bill 7 for sewerage works, Block C" : "What this voucher is for"}
        value={f.narration}
        onChange={(e) => set({ narration: e.target.value })}
        error={errors.narration}
      />
      {!canPost && <Textarea label="Note for the approver (optional)" rows={2} placeholder="Anything they should know before posting it" value={f.reason} onChange={(e) => set({ reason: e.target.value })} />}
    </Dialog>
  )
}
