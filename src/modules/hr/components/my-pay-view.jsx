"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { NumberInput } from "@/components/ui/number-input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { ADVANCE_MAX_MONTHS, SALARY_PARTS, installmentFor, nextMonth } from "../constants"
import { requestAdvance } from "../server/actions"
import { figure, monthLabel, rupees } from "../payslip-parts"
import { PayslipDocument } from "./payslip-document"
import { LoanStatusBadge } from "./people-parts"
import { thisMonth } from "./payroll-parts"

// My Desk › My pay: monthly salary parts, how it's paid, my advances and loans, my payslips
// (print / PDF) and asking for a salary advance (up to a month's gross, over 1–6 months).
//   data: myPay() · brand: getWorkspaceBrand()

function AdvanceDialog({ gross, onClose, onDone }) {
  const [amount, setAmount] = useState(null)
  const [months, setMonths] = useState("2")
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  useUnsavedGuard(Boolean(amount || reason))
  const n = Number(months)
  const installment = amount > 0 ? installmentFor(amount, n) : 0
  const over = amount > gross
  // Recovery starts from next month's salary
  const first = nextMonth(thisMonth())
  const send = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => requestAdvance({ amount, months: n, reason }), { loading: "Sending…", success: SENT_FOR_APPROVAL })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-md"
      title="Ask for a salary advance"
      description="It goes for approval. Once paid, it's taken back from your salary in monthly parts."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="send-plane-line" loading={pending} disabled={!(amount > 0) || over} onClick={send}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NumberInput
          label="Amount"
          prefix="Rs"
          min={0}
          max={gross}
          step={5000}
          format={{ maximumFractionDigits: 0 }}
          value={amount}
          onChange={(v) => setAmount(v)}
          error={errors.amount ?? (over ? `Up to one month's salary (${rupees(gross)}).` : undefined)}
        />
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">Pay back over</p>
          <ToggleGroup value={months} onChange={(v) => v && setMonths(v)} options={Array.from({ length: ADVANCE_MAX_MONTHS }, (_, i) => ({ value: String(i + 1), label: i ? `${i + 1} months` : "1 month" }))} />
          {errors.months && <p className="mt-1 text-sm text-destructive">{errors.months}</p>}
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          {installment ? (
            <>
              <span className="font-medium tabular-nums">{rupees(installment)}</span> a month from your salary, starting {monthLabel(first)}
              {n > 1 && ` until ${monthLabel(addMonths(first, n - 1))}`}.
            </>
          ) : (
            <span className="text-muted-foreground">Up to {rupees(gross)}, one month&apos;s salary.</span>
          )}
        </div>
        <Textarea label="What it's for" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
      </div>
    </Dialog>
  )
}

const addMonths = (month, k) => {
  let m = month
  for (let i = 0; i < k; i++) m = nextMonth(m)
  return m
}

export function MyPayView({ data, brand }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null)
  const open = data.loans.filter((l) => ["pending", "active"].includes(l.status))
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My pay"
        description="Your salary, payslips and advances. Ask HR if something looks wrong."
        actions={
          data.canAsk && (
            <Button variant="outline" leftIcon="hand-coin-line" onClick={() => setDialog("advance")}>
              Ask for an advance
            </Button>
          )
        }
      />
      <SectionCard title="Monthly salary" action={<span className="text-sm font-semibold tabular-nums">{rupees(data.gross)}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SALARY_PARTS.map((p) => (
            <div key={p.key} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="truncate text-xs text-muted-foreground">{p.label}</p>
              <p className="text-sm font-medium tabular-nums">{figure(data.salary[p.key])}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name={data.bank ? "bank-line" : "money-rupee-circle-line"} />
          {data.bank ? `Paid by bank transfer${data.bank.name ? ` to ${data.bank.name}` : ""}${data.bank.last4 ? ` (account ending ${data.bank.last4})` : ""}` : "Paid in cash"}
          {data.pf ? " · provident fund member" : ""}
        </p>
      </SectionCard>

      {data.loans.length > 0 && (
        <SectionCard title="Advances and loans" bodyClassName="px-4 py-1">
          <ul className="divide-y">
            {data.loans.map((l) => (
              <li key={l.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {l.kind === "advance" ? "Salary advance" : "Loan"} of {rupees(l.amount)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{[l.code, l.givenAt ? `given ${formatDate(l.givenAt)}` : `asked ${formatDate(l.askedAt)}`, l.reason].filter(Boolean).join(" · ")}</span>
                </span>
                {l.status === "active" && (
                  <span className="text-right text-xs tabular-nums">
                    <span className="block font-medium">{rupees(l.left)} left</span>
                    <span className="block text-muted-foreground">{rupees(l.installment)} a month</span>
                  </span>
                )}
                <LoanStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
          {open.length > 0 && !data.canAsk && <p className="pb-3 text-xs text-muted-foreground">You can ask for another advance once this one is recovered.</p>}
        </SectionCard>
      )}

      <SectionCard title="Payslips" bodyClassName="px-2 py-2">
        {data.payslips.length ? (
          <ul>
            {data.payslips.map((s) => (
              <li key={s.run.code}>
                <button type="button" onClick={() => setDialog(s)} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60">
                  <Icon name="file-list-3-line" className="text-muted-foreground" />
                  <span className="flex-1 font-medium">{monthLabel(s.run.month)}</span>
                  <span className="text-xs text-muted-foreground max-sm:hidden">Paid {formatDate(s.run.paidAt)}</span>
                  <span className="w-28 text-right font-medium tabular-nums">{rupees(s.slip.net)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No payslips yet. They appear here once a month&apos;s salaries are paid.</p>
        )}
      </SectionCard>

      {dialog === "advance" && (
        <AdvanceDialog
          gross={data.gross}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}
      {dialog?.slip && (
        <PrintPreviewDialog
          title={`Payslip · ${monthLabel(dialog.run.month)}`}
          printUrl={`/my-pay/${urlCode(dialog.run.code)}/print`}
          pdfUrl={`/api/hr/payroll/${urlCode(dialog.run.code)}/pdf?employee=${urlCode(data.employee.code)}`}
          onClose={() => setDialog(null)}
        >
          <PayslipDocument slip={dialog.slip} run={dialog.run} brand={brand} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}
