"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { methodLabel } from "@/components/billing/methods"
import { Notice } from "@/modules/users/components/user-parts"
import { InvoiceDocument } from "@/modules/console/components/invoice-document"
import { AppIcon } from "@/components/app-icon"
import { CopyField } from "@/components/copy-field"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { loadWorkspaceInvoice, requestPlanChange, sendTransferProof } from "./actions"

const STATUS = {
  trial: { label: "Free trial", color: "sky" },
  active: { label: "Active", color: "green" },
  past_due: { label: "Payment overdue", color: "red" },
  suspended: { label: "Suspended", color: "red" },
}
const INVOICE_STATUS = {
  issued: { label: "Due", color: "amber" },
  overdue: { label: "Overdue", color: "red" },
  awaiting: { label: "Checking transfer", color: "blue" },
  paid: { label: "Paid", color: "green" },
  void: { label: "Void", color: "gray" },
}
const today = () => new Date().toISOString().slice(0, 10)
const limitText = (n, noun) => (n == null ? `Unlimited ${noun}s` : `${n} ${n === 1 ? noun : `${noun}s`}`)

function Usage({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{used}</span> {limit ? `of ${limit}` : "· unlimited"}
        </span>
      </div>
      {limit ? (
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className={cn("block h-full", pct >= 90 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
    </div>
  )
}

// Pick another plan and cycle → a request to PropFlow, who invoice the change
function ChangePlanDialog({ data, onClose, onDone }) {
  const [planCode, setPlanCode] = useState(data.plan?.code ?? data.plans[0]?.code)
  const [cycle, setCycle] = useState(data.tenant.billingCycle)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const same = planCode === data.plan?.code && cycle === data.tenant.billingCycle
  const priceOf = (p) => (cycle === "yearly" ? p.priceMonthly * data.yearlyMonths : p.priceMonthly)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title="Change plan"
      description="We'll send an invoice for the new plan; it switches on when that's paid. Your data stays as it is."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon="send-plane-line"
            loading={pending}
            disabled={same}
            onClick={() =>
              startTransition(async () => {
                setError("")
                const r = await requestPlanChange({ planCode, cycle, note })
                if (r.error) setError(r.error)
                else onDone(r.code)
              })
            }
          >
            Request change
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <ToggleGroup
        value={cycle}
        onChange={(v) => v && setCycle(v)}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: `Yearly · ${12 - data.yearlyMonths} months free` },
        ]}
      />
      <div role="radiogroup" aria-label="Plan" className="grid gap-2 sm:grid-cols-2">
        {data.plans.map((p) => {
          const on = p.code === planCode
          return (
            <button
              key={p.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPlanCode(p.code)}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {p.name}
                {p.code === data.plan?.code ? <span className="text-xs font-normal text-muted-foreground">Current</span> : on && <Icon name="checkbox-circle-fill" className="text-primary" />}
              </span>
              <span className="mt-1 block text-lg font-semibold tabular-nums">
                {formatPkr(priceOf(p))}
                <span className="text-xs font-normal text-muted-foreground"> / {cycle === "yearly" ? "year" : "month"}</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                {limitText(p.maxProjects, "project")} · {limitText(p.maxUsers, "user")}
              </span>
              {p.apps.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">{p.apps.join(", ")}</span>}
            </button>
          )
        })}
      </div>
      <Textarea label="Anything we should know?" rows={2} placeholder="e.g. Start from next month" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  )
}

// "I've paid by bank transfer": reference, date and the receipt
function TransferDialog({ invoice, bank, onClose, onDone }) {
  const [reference, setReference] = useState("")
  const [paidOn, setPaidOn] = useState(today)
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const submit = () =>
    startTransition(async () => {
      setErrors({})
      setError("")
      const fd = new FormData()
      fd.set("reference", reference)
      fd.set("paidOn", paidOn)
      if (file) fd.set("proof", file)
      const r = await sendTransferProof(invoice.code, fd)
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else onDone()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-lg"
      title={`Pay ${invoice.code}`}
      description={`${formatPkr(invoice.total)} by bank transfer. We confirm it within one working day.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="send-plane-line" loading={pending} onClick={submit}>
            Send receipt
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {bank ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {bank.accountTitle} · {bank.bankName}
            {bank.branch ? `, ${bank.branch}` : ""}
          </p>
          <CopyField label="IBAN" value={bank.iban} />
          <p className="text-xs text-muted-foreground">
            Use {invoice.code} as the payment reference.{bank.instructions ? ` ${bank.instructions}` : ""}
          </p>
        </div>
      ) : (
        <Notice tone="error">Bank transfer details aren&apos;t available right now. Contact PropFlow support to pay this invoice.</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <Input label="Transaction / reference no." required value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} />
        <DatePicker label="Paid on" required clearable={false} value={paidOn} onChange={(v) => setPaidOn(v || today())} error={errors.paidOn} />
      </div>
      <div className="space-y-1">
        <p className="text-base text-muted-foreground">
          Receipt <span className="text-sm text-destructive">*</span>
        </p>
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm hover:bg-muted/40", errors.proof && "border-destructive")}>
          <Icon name={file ? "file-check-line" : "upload-2-line"} className="text-xl text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Bank receipt or screenshot · JPG, PNG or PDF, up to 10 MB"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {errors.proof && <p className="text-[13px] text-destructive">{errors.proof}</p>}
      </div>
    </Dialog>
  )
}

function InvoicePreview({ code, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    loadWorkspaceInvoice(code).then((r) => live && setData(r))
    return () => {
      live = false
    }
  }, [code])
  return (
    <PrintPreviewDialog title={code} description="PropFlow invoice · print preview (A4)" printUrl={`/settings/billing/invoices/${urlCode(code)}`} pdfUrl={`/api/workspace/invoices/${urlCode(code)}/pdf`} onClose={onClose}>
      {!data ? (
        <div className="flex h-96 items-center justify-center text-muted-foreground">
          <Icon name="loader-3-fill" className="animate-spin text-2xl" />
        </div>
      ) : data.error ? (
        <div className="py-4">
          <Notice tone="error">{data.error}</Notice>
        </div>
      ) : (
        <InvoiceDocument inv={data.inv} bank={data.bank} />
      )}
    </PrintPreviewDialog>
  )
}

export function BillingView({ data, workspaceName, canEdit }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // { kind: "plan" } | { kind: "pay", invoice } | { kind: "view", code }
  const [notice, setNotice] = useState(null)
  const { tenant, plan, price, usage } = data
  const status = STATUS[tenant.status] ?? STATUS.active
  const due = data.invoices.filter((i) => ["issued", "overdue"].includes(i.displayStatus))
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Subscription & Billing" description={`${workspaceName} · plan, usage and invoices`} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {due.length > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <Icon name="error-warning-line" className="text-lg text-amber-600 dark:text-amber-400" />
          <span className="flex-1">
            {due.length === 1
              ? `Invoice ${due[0].code} for ${formatPkr(due[0].total)} is due${due[0].dueAt ? ` by ${formatDate(due[0].dueAt)}` : ""}.`
              : `${due.length} invoices are due, ${formatPkr(due.reduce((s, i) => s + i.total, 0))} in all.`}
          </span>
          <Button size="sm" leftIcon="bank-line" onClick={() => setDialog({ kind: "pay", invoice: due[0] })}>
            Pay {due[0].code}
          </Button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Your plan" className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-semibold">{plan?.name ?? "No plan"}</span>
                <Badge color={status.color} dot>
                  {status.label}
                </Badge>
              </div>
              {price && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPkr(price.amount)} {price.cycle === "yearly" ? "a year" : "a month"} · billed {price.cycle}
                </p>
              )}
            </div>
            {canEdit && (
              <Button variant={tenant.status === "trial" ? "default" : "outline"} leftIcon={tenant.status === "trial" ? "vip-crown-line" : "exchange-line"} onClick={() => setDialog({ kind: "plan" })}>
                {tenant.status === "trial" ? "Choose a plan" : "Change plan"}
              </Button>
            )}
          </div>
          {tenant.status === "trial" && tenant.trialEndsAt && (
            <div className="mt-5 rounded-xl bg-sky-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-sky-900 dark:text-sky-200">
                  {tenant.daysLeft} {tenant.daysLeft === 1 ? "day" : "days"} left in your free trial
                </span>
                <span className="text-sky-800 dark:text-sky-300">Ends {formatDate(tenant.trialEndsAt)}</span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sky-500/20">
                <span className="block h-full bg-sky-500" style={{ width: `${Math.min(100, ((tenant.trialDays - tenant.daysLeft) / tenant.trialDays) * 100)}%` }} />
              </span>
              <p className="mt-2 text-xs text-sky-800 dark:text-sky-300">Pay before the trial ends to keep everything. Nothing is deleted when it ends; the workspace becomes read-only until you pay.</p>
            </div>
          )}
          {tenant.status === "past_due" && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">Your payment is overdue. Pay the open invoice to keep the workspace running.</p>}
          {tenant.status === "active" && tenant.currentPeriodEndsAt && <p className="mt-4 text-sm text-muted-foreground">Renews on {formatDate(tenant.currentPeriodEndsAt)}</p>}

          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-sm font-medium">Apps in your workspace</p>
            <ul className="flex flex-wrap gap-2">
              {data.apps.map((a) => (
                <li key={a.code} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm">
                  <AppIcon icon={a.icon} color={a.color} size="sm" className="size-6 rounded-md text-sm" /> {a.name}
                  {a.without && <span className="text-xs text-muted-foreground">· {a.without}</span>}
                  {a.extra && <span className="text-xs text-muted-foreground">· add-on</span>}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Usage" bodyClassName="space-y-5">
          <Usage label="Users" used={usage.users.used} limit={usage.users.limit} />
          <Usage label="Dealer logins" used={usage.dealers.used} limit={usage.dealers.limit} />
          <Usage label="Projects" used={usage.projects.used} limit={usage.projects.limit} />
          <p className="text-xs text-muted-foreground">Need more room? Change to a bigger plan, or ask us to add users to this one.</p>
        </SectionCard>
      </div>

      <SectionCard title="Invoices" bodyClassName="p-0">
        {data.invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Invoice</th>
                  <th className="px-4 py-2 text-left font-medium">Issued</th>
                  <th className="px-4 py-2 text-left font-medium">Period</th>
                  <th className="px-4 py-2 text-left font-medium">Paid with</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="w-px px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.invoices.map((inv) => {
                  const s = INVOICE_STATUS[inv.displayStatus] ?? INVOICE_STATUS.issued
                  return (
                    <tr key={inv.code} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <button type="button" className="cursor-pointer font-mono text-xs whitespace-nowrap text-primary hover:underline" onClick={() => setDialog({ kind: "view", code: inv.code })}>
                          {inv.code}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(inv.issuedAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{inv.periodStart ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : "—"}</td>
                      <td className="px-4 py-2.5">
                        {inv.payment ? methodLabel(inv.payment.method) : "—"}
                        {inv.payment?.reference && <span className="block font-mono text-xs text-muted-foreground">{inv.payment.reference}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{formatPkr(inv.total)}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={s.color} dot>
                          {s.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {canEdit && ["issued", "overdue"].includes(inv.displayStatus) && (
                            <Button size="sm" leftIcon="bank-line" onClick={() => setDialog({ kind: "pay", invoice: inv })}>
                              Pay
                            </Button>
                          )}
                          <Button size="sm" variant="outline" leftIcon="eye-line" onClick={() => setDialog({ kind: "view", code: inv.code })}>
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices yet. Your first one arrives before your trial ends.</p>
        )}
      </SectionCard>

      {dialog?.kind === "plan" && (
        <ChangePlanDialog
          data={data}
          onClose={() => setDialog(null)}
          onDone={(code) => {
            setDialog(null)
            setNotice({ tone: "success", text: `Request ${code} sent. PropFlow will send the invoice for the new plan shortly.` })
          }}
        />
      )}
      {dialog?.kind === "pay" && (
        <TransferDialog
          invoice={dialog.invoice}
          bank={data.bank}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            setNotice({ tone: "success", text: `Thanks! We'll confirm your transfer for ${dialog.invoice.code} within one working day.` })
            router.refresh()
          }}
        />
      )}
      {dialog?.kind === "view" && <InvoicePreview code={dialog.code} onClose={() => setDialog(null)} />}
    </div>
  )
}
