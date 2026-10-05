"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { StatTile } from "@/components/stat-tile"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SENT_FOR_APPROVAL } from "@/modules/approvals/components/reason-dialog"
import { adjustPayrollLine, payRun, refreshDraft, setRunStatus } from "../server/actions"
import { figure, monthLabel, rupees } from "../payslip-parts"
import { PayslipDocument, PayslipStack } from "./payslip-document"
import { RunStatusBadge } from "./payroll-parts"

// HR › Payroll › one month: the payslip lines, adjustments on the draft, approve, pay (posts to
// Finance), the bank's bulk-transfer file and the payslips.
//   run: getRun() · accounts: bank accounts (default first) · brand: getWorkspaceBrand()
//   can: { amounts (hr.salaries), manage (hr.payroll), pay, payDirect (finance approver), finance (open Finance) }
//   openEmployee: "emp-00001" from ?employee= opens that payslip

function AdjustDialog({ run, line, onClose, onSaved }) {
  const initial = { bonus: line.bonus, otherDeduction: line.otherDeduction, extraUnpaidDays: line.extraUnpaidDays, note: line.note ?? "" }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => adjustPayrollLine(run.code, { employee: line.employee.code, ...form }), { loading: "Saving…", success: `${line.employee.name}'s pay adjusted.` })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onSaved()
    })
  const close = async () => {
    if (dirty && !(await confirm({ title: "Discard these changes?", confirmLabel: "Discard", destructive: true }))) return
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && close()}
      className="sm:max-w-md"
      title={`Adjust ${line.employee.name}`}
      description={`${monthLabel(run.month)} only. Unpaid leave, absences and loan installments are already counted.`}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput label="Bonus / overtime" prefix="Rs" min={0} step={1000} format={{ maximumFractionDigits: 0 }} value={form.bonus} onChange={(v) => set({ bonus: v ?? 0 })} error={errors.bonus} />
        <NumberInput
          label="Other deduction"
          prefix="Rs"
          min={0}
          step={500}
          format={{ maximumFractionDigits: 0 }}
          value={form.otherDeduction}
          onChange={(v) => set({ otherDeduction: v ?? 0 })}
          error={errors.otherDeduction}
        />
        <NumberInput
          label="Extra unpaid days"
          info="On top of unpaid leave and absences already marked"
          suffix="days"
          min={0}
          max={31}
          step={0.5}
          value={form.extraUnpaidDays}
          onChange={(v) => set({ extraUnpaidDays: v ?? 0 })}
          error={errors.extraUnpaidDays}
        />
        <Input label="Note on the payslip" maxLength={300} value={form.note} onChange={(e) => set({ note: e.target.value })} error={errors.note} />
      </div>
    </Dialog>
  )
}

function PayDialog({ run, accounts, direct, onClose, onPaid }) {
  const [accountId, setAccountId] = useState(() => String(accounts[0]?.id ?? ""))
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const t = run.totals
  const pay = () =>
    startTransition(async () => {
      const r = await toastAction(() => payRun(run.code, { accountId: accountId ? Number(accountId) : null, reason }), {
        loading: direct ? "Paying and posting to Finance…" : "Sending…",
        success: (res) => (res.pending ? SENT_FOR_APPROVAL : `${monthLabel(run.month)} salaries paid and posted to Finance.`),
      })
      if (r?.ok) onPaid()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-lg"
      title={direct ? `Pay ${monthLabel(run.month)} salaries` : `Ask to pay ${monthLabel(run.month)} salaries`}
      description={direct ? "Once paid, the payslips are final and the salaries post to Finance." : "A Finance approver pays it from Approvals; the salaries post to Finance then."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={direct ? "bank-line" : "send-plane-line"} loading={pending} onClick={pay} disabled={!accountId && t.bank > 0}>
            {direct ? "Pay salaries" : "Send for approval"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {accounts.length > 0 ? (
          <Select
            label="Bank transfers from"
            value={accountId}
            onChange={(v) => setAccountId(v)}
            options={accounts.map((a) => ({ value: String(a.id), label: [a.name, a.bankName].filter(Boolean).join(" · ") + (a.isDefault ? " (default)" : "") }))}
          />
        ) : (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">No bank account in Finance yet. Add one under Finance › Banks first.</p>
        )}
        <dl className="space-y-1.5 text-sm">
          {[
            ["Bank transfers", t.bank],
            ["Paid in cash", t.cash],
            ["Salary tax withheld (to deposit with FBR)", t.tax],
            ["EOBI and provident fund, with the employer's share", t.eobi + t.pf + t.employer],
            ["Loans and advances recovered", t.loan],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="tabular-nums">{rupees(v)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
            <dt>Net pay</dt>
            <dd className="tabular-nums">{rupees(t.net)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">Upload the bank file to your bank&apos;s portal first, then pay here.</p>
        {!direct && <Textarea label="Note for the approver (optional)" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Dialog>
  )
}

// The bank's bulk-transfer sheet (IBFT) as CSV, for bank-paid lines
function downloadBankFile(run) {
  const rows = [
    ["Employee", "CNIC", "Bank", "Account title", "IBAN", "Amount", "Reference"],
    ...run.lines
      .filter((l) => l.payMethod !== "cash" && l.net > 0)
      .map((l) => [l.employee.name, l.employee.cnic ?? "", l.employee.bankName ?? "", l.employee.accountTitle ?? l.employee.name, l.employee.iban ?? "", Math.round(l.net), run.code]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }))
  a.download = `Salaries ${run.month}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const num = (v) => (v ? figure(v) : "—")

export function PayrollRunView({ run, accounts, brand, can, openEmployee = null }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(() => {
    const line = openEmployee && can.amounts ? run.lines.find((l) => l.employee.code.toLowerCase() === String(openEmployee).toLowerCase()) : null
    return line ? { slip: line } : null
  })
  const [pending, startTransition] = useTransition()
  const t = run.totals
  const draft = run.status === "draft"
  const bankLines = can.amounts ? run.lines.filter((l) => l.payMethod !== "cash" && l.net > 0) : []
  const done = () => {
    setDialog(null)
    router.refresh()
  }
  const act = (fn, opts) =>
    startTransition(async () => {
      const r = await toastAction(fn, opts)
      if (r?.ok) router.refresh()
    })
  const rebuild = () => act(() => refreshDraft(run.month), { loading: "Rebuilding the draft…", success: "Draft rebuilt from today's salaries, leave, attendance and loans." })
  const approve = async () => {
    if (!(await confirm({ title: `Approve ${monthLabel(run.month)} payroll?`, description: "It's rebuilt once more, then locked for paying. You can send it back to draft until it's paid.", confirmLabel: "Approve" })))
      return
    act(() => setRunStatus(run.code, "approved"), { loading: "Approving…", success: "Payroll approved. It can be paid now." })
  }
  const backToDraft = () => act(() => setRunStatus(run.code, "draft"), { loading: "Sending back…", success: "Back to draft." })
  const slipUrl = (code) => `/hrm/payroll/${urlCode(run.code)}/print${code ? `?employee=${urlCode(code)}` : ""}`
  const pdfUrl = (code) => `/api/hr/payroll/${urlCode(run.code)}/pdf${code ? `?employee=${urlCode(code)}` : ""}`
  const runDoc = { code: run.code, month: run.month, status: run.status, paidAt: run.paidAt }

  const subtitle =
    run.status === "paid"
      ? `Paid ${formatDate(run.paidAt)}${run.paidBy ? ` by ${run.paidBy}` : ""}${run.account ? ` from ${run.account.name}` : ""}`
      : run.pending
        ? `Payment sent for approval${run.pending.by ? ` by ${run.pending.by}` : ""}: waiting in Approvals`
        : run.status === "approved"
          ? `Approved${run.approvedBy ? ` by ${run.approvedBy}` : ""}${run.approvedAt ? ` on ${formatDate(run.approvedAt)}` : ""}. Ready to pay.`
          : "Draft: worked out from salaries, unpaid leave, absences and loans. Rebuild after changes."

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/hrm/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Payroll
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{monthLabel(run.month)} payroll</h1>
              <RunStatusBadge status={run.status} pending={Boolean(run.pending)} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft && can.manage && (
              <>
                <Button variant="outline" leftIcon="refresh-line" loading={pending} onClick={rebuild}>
                  Rebuild draft
                </Button>
                <Button leftIcon="checkbox-circle-line" disabled={pending || !run.lines.length} onClick={approve}>
                  Approve
                </Button>
              </>
            )}
            {run.status === "approved" && !run.pending && (
              <>
                {can.manage && (
                  <Button variant="outline" leftIcon="arrow-go-back-line" loading={pending} onClick={backToDraft}>
                    Back to draft
                  </Button>
                )}
                {can.pay && can.amounts && (
                  <Button leftIcon={can.payDirect ? "bank-line" : "send-plane-line"} onClick={() => setDialog("pay")}>
                    {can.payDirect ? "Pay" : "Send for approval"}
                  </Button>
                )}
              </>
            )}
            {run.pending && (
              <Button variant="outline" leftIcon="shield-check-line" nativeButton={false} render={<Link href="/approvals" />}>
                In Approvals
              </Button>
            )}
            {run.voucher && can.finance && (
              <Button variant="outline" leftIcon="book-2-line" nativeButton={false} render={<Link href={`/finance/vouchers?open=${urlCode(run.voucher.code)}`} />}>
                Voucher {run.voucher.code}
              </Button>
            )}
            {bankLines.length > 0 && (
              <Button variant="outline" leftIcon="download-2-line" onClick={() => downloadBankFile(run)}>
                Bank file
              </Button>
            )}
            {can.amounts && run.lines.length > 0 && (
              <Button variant="outline" leftIcon="printer-line" onClick={() => setDialog("slips")}>
                Payslips
              </Button>
            )}
          </div>
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="team-line" label="People" value={run.people} hint={`${run.lines.filter((l) => l.unpaidDays).length} with unpaid days`} />
          <StatTile icon="money-rupee-circle-line" tone="violet" label="Gross" value={formatPkr(t.gross)} hint={`Employer's EOBI and PF ${formatPkr(t.employer)}`} />
          <StatTile
            icon="government-line"
            tone="amber"
            label="Deductions"
            value={formatPkr(t.deductions)}
            hint={`Tax ${formatPkr(t.tax)} · EOBI ${formatPkr(t.eobi)} · PF ${formatPkr(t.pf)} · loans ${formatPkr(t.loan)} · unpaid days ${formatPkr(t.unpaid)}`}
          />
          <StatTile icon="bank-line" tone="green" label="Net pay" value={formatPkr(t.net)} hint={`${formatPkr(t.bank)} by bank · ${formatPkr(t.cash)} in cash`} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <ScrollView orientation="horizontal">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Employee</th>
                {can.amounts && (
                  <>
                    <th className="px-3 py-2.5 text-right font-medium">Gross</th>
                    <th className="px-3 py-2.5 text-right font-medium">Unpaid days</th>
                    <th className="px-3 py-2.5 text-right font-medium">Bonus</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tax</th>
                    <th className="px-3 py-2.5 text-right font-medium">EOBI</th>
                    <th className="px-3 py-2.5 text-right font-medium">PF</th>
                    <th className="px-3 py-2.5 text-right font-medium">Loan</th>
                    <th className="px-3 py-2.5 text-right font-medium">Other</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net</th>
                  </>
                )}
                {!can.amounts && <th className="px-3 py-2.5 text-right font-medium">Unpaid days</th>}
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {run.lines.map((l) => (
                <tr key={l.employee.code} className={cn(can.amounts && "cursor-pointer hover:bg-muted/40")} onClick={() => can.amounts && setDialog({ slip: l })}>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{l.employee.name}</span>
                    <span className="block text-xs text-muted-foreground">{[l.employee.code, l.employee.designation, l.payMethod === "cash" ? "cash" : null, l.note].filter(Boolean).join(" · ")}</span>
                  </td>
                  {can.amounts ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">{figure(l.gross)}</td>
                      <td className={cn("px-3 py-2 text-right whitespace-nowrap tabular-nums", l.unpaidDays > 0 && "text-red-600 dark:text-red-400")}>
                        {l.unpaidDays ? `${l.unpaidDays} (−${figure(l.unpaidDeduction)})` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.bonus)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.tax)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.eobi)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.pf)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.loan)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.otherDeduction)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{figure(l.net)}</td>
                    </>
                  ) : (
                    <td className="px-3 py-2 text-right tabular-nums">{l.unpaidDays || "—"}</td>
                  )}
                  <td className="px-2 py-1 text-right">
                    {draft && can.manage && can.amounts && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setDialog({ adjust: l })
                        }}
                      >
                        Adjust
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!run.lines.length && (
                <tr>
                  <td colSpan={12} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    No one on the payroll this month. Add employees, then rebuild the draft.
                  </td>
                </tr>
              )}
            </tbody>
            {t && run.lines.length > 0 && (
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{figure(t.gross - t.bonus)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.unpaid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.bonus)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.tax)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.eobi)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.pf)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.loan)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(t.other)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{figure(t.net)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </ScrollView>
      </div>

      {dialog?.adjust && <AdjustDialog run={run} line={dialog.adjust} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog === "pay" && <PayDialog run={run} accounts={accounts} direct={can.payDirect} onClose={() => setDialog(null)} onPaid={done} />}
      {dialog === "slips" && (
        <PrintPreviewDialog title={`Payslips · ${monthLabel(run.month)}`} description={`${run.lines.length} payslips (A4, one a page)`} printUrl={slipUrl()} pdfUrl={pdfUrl()} onClose={() => setDialog(null)}>
          <PayslipStack slips={run.lines} run={runDoc} brand={brand} />
        </PrintPreviewDialog>
      )}
      {dialog?.slip && (
        <PrintPreviewDialog title={`Payslip · ${dialog.slip.employee.name}`} printUrl={slipUrl(dialog.slip.employee.code)} pdfUrl={pdfUrl(dialog.slip.employee.code)} onClose={() => setDialog(null)}>
          <PayslipDocument slip={dialog.slip} run={runDoc} brand={brand} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}
