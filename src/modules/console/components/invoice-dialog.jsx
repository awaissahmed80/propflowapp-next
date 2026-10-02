"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createInvoice, suggestInvoice, updateInvoice } from "../server/invoices"
import { Notice } from "./parts"
import { urlCode } from "@/lib/url"

const round2 = (n) => Math.round(n * 100) / 100
// "yyyy-MM-dd" in Pakistan, n days from today
const pkDay = (addDays = 0) => new Date(Date.now() + 5 * 3_600_000 + addDays * 86_400_000).toISOString().slice(0, 10)
const emptyLine = () => ({ key: Math.random().toString(36).slice(2), description: "", quantity: 1, unitPrice: 0 })

// "2026-10-01T19:00:00.000Z" (a moment) → "2026-10-02" (that day in Pakistan)
const toPkDay = (d) => (d ? new Date(new Date(d).getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : "")

// The invoice form. New: workspace { id, name } to invoice a known workspace, or workspaces
// [{ id, name, code }] to pick one. Edit: invoice (from loadInvoice) fills everything in.
// taxRate: the platform's sales tax rate (%).
export function InvoiceDialog({ workspace, workspaces = [], invoice, taxRate, onClose, onDone }) {
  const editing = Boolean(invoice)
  const [tenantId, setTenantId] = useState(invoice?.tenantId ?? workspace?.id ?? null)
  const [form, setForm] = useState(() =>
    invoice
      ? {
          issueDate: toPkDay(invoice.issuedAt) || pkDay(),
          dueDate: toPkDay(invoice.dueAt) || pkDay(14),
          periodStart: toPkDay(invoice.periodStart),
          periodEnd: toPkDay(invoice.periodEnd),
          applyTax: Number(invoice.taxRate) > 0,
          notes: invoice.notes ?? "",
          sendEmail: false,
        }
      : { issueDate: pkDay(), dueDate: pkDay(14), periodStart: "", periodEnd: "", applyTax: taxRate > 0, notes: "", sendEmail: false },
  )
  const [lines, setLines] = useState(() =>
    invoice?.lines?.length ? invoice.lines.map((l) => ({ ...emptyLine(), description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) : [emptyLine()],
  )
  const [billTo, setBillTo] = useState(null)
  // An edited invoice keeps its own tax rate
  const rate = editing && Number(invoice.taxRate) > 0 ? Number(invoice.taxRate) : taxRate
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [filling, startFilling] = useTransition()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setLine = (key, k) => (v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)))

  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0))
  const tax = form.applyTax ? round2((subtotal * rate) / 100) : 0
  const total = round2(subtotal + tax)

  // Load the workspace's details and usual lines: on opening, when a workspace is picked, and
  // from "Fill from subscription" (which puts the lines back after editing)
  const load = (id, { linesToo = true } = {}) =>
    startFilling(async () => {
      const s = await suggestInvoice(id)
      if (s.error) return setError(s.error)
      setBillTo(s.billTo)
      if (linesToo) {
        setForm((f) => ({ ...f, periodStart: s.periodStart, periodEnd: s.periodEnd }))
        setLines(s.lines.map((l) => ({ ...emptyLine(), ...l })))
      }
      setError("")
    })
  useEffect(() => {
    // Editing keeps the invoice's own lines; only the bill-to details are loaded
    if (tenantId) load(tenantId, { linesToo: !editing })
  }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps
  const fill = () => (tenantId ? load(tenantId) : setErrors({ tenantId: "Pick a workspace first." }))

  const save = (issue) =>
    startTransition(async () => {
      setError("")
      setErrors({})
      const fields = {
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        periodStart: form.periodStart || null,
        periodEnd: form.periodEnd || null,
        lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 })),
        applyTax: form.applyTax,
        notes: form.notes || null,
        issue,
      }
      const result = editing ? await updateInvoice(invoice.id, { ...fields, sendEmail: form.sendEmail }) : await createInvoice({ ...fields, tenantId })
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        setError("Please check the highlighted fields.")
      } else if (result.error) setError(result.error)
      else onDone(result, issue)
    })

  const lineError = (i, k) => errors[`lines.${i}.${k}`]

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      // Wide enough for the line editor, but always leaves a margin around it
      className="sm:max-w-[min(64rem,calc(100%-4rem))]"
      title={editing ? `Edit ${invoice.code}` : workspace ? `New invoice for ${workspace.name}` : "New invoice"}
      description={
        editing
          ? invoice.status === "draft"
            ? "A draft: change anything, then save it or issue it."
            : "Already issued. The number stays the same; changes are recorded in the audit log."
          : "Amounts are in PKR. Issuing emails it to the workspace with your bank details."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!editing || invoice.status === "draft" ? (
            <>
              <Button variant="outline" loading={pending} onClick={() => save(false)}>
                {editing ? "Save draft" : "Save as draft"}
              </Button>
              <Button leftIcon="send-plane-line" loading={pending} onClick={() => save(true)}>
                Issue &amp; email
              </Button>
            </>
          ) : (
            <Button leftIcon={form.sendEmail ? "send-plane-line" : "save-line"} loading={pending} onClick={() => save(false)}>
              {form.sendEmail ? "Save & email" : "Save changes"}
            </Button>
          )}
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {billTo && (
        <div className="grid gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:row-span-2 sm:pt-0.5">Bill to</p>
          <p>
            <span className="font-medium">{billTo.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {billTo.code}
              {billTo.owner ? ` · ${billTo.owner}` : ""}
              {billTo.city ? ` · ${billTo.city}` : ""}
              {billTo.ntn ? ` · NTN ${billTo.ntn}` : ""}
            </span>
          </p>
          {billTo.email ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Icon name="mail-line" /> Emailed to {billTo.email}
              {billTo.phone ? ` · ${billTo.phone}` : ""}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <Icon name="error-warning-line" /> No email on file, so it can&apos;t be emailed. Add one in the workspace&apos;s details.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!workspace && !editing && (
          <div className="sm:col-span-2">
            <Select label="Workspace" placeholder="Pick a workspace" value={tenantId} onChange={setTenantId} options={workspaces.map((w) => ({ value: w.id, label: `${w.name} · ${w.code}` }))} error={errors.tenantId} />
          </div>
        )}
        <DatePicker label="Issue date" value={form.issueDate} onChange={set("issueDate")} clearable={false} error={errors.issueDate} />
        <DatePicker label="Due date" value={form.dueDate} onChange={set("dueDate")} clearable={false} minDate={form.issueDate} error={errors.dueDate} />
        <DatePicker label="Billing period from (optional)" value={form.periodStart} onChange={set("periodStart")} error={errors.periodStart} />
        <DatePicker label="Billing period to" value={form.periodEnd} onChange={set("periodEnd")} minDate={form.periodStart || undefined} error={errors.periodEnd} />
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-medium">Lines</p>
          <Button size="sm" variant="ghost" leftIcon="magic-line" loading={filling} onClick={fill}>
            Fill from subscription
          </Button>
        </div>
        <div className={cn("divide-y", filling && "pointer-events-none opacity-50")} aria-busy={filling}>
          {lines.map((l, i) => (
            <div key={l.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_7rem_2.25rem] sm:items-start">
              <Input aria-label="Description" placeholder="e.g. Growth plan, yearly" value={l.description} onChange={(e) => setLine(l.key, "description")(e.target.value)} error={lineError(i, "description")} />
              <NumberInput aria-label="Quantity" min={0} value={l.quantity} onChange={(v) => setLine(l.key, "quantity")(v ?? 0)} error={lineError(i, "quantity")} />
              <NumberInput aria-label="Unit price" prefix="Rs" min={0} value={l.unitPrice} onChange={(v) => setLine(l.key, "unitPrice")(v ?? 0)} error={lineError(i, "unitPrice")} />
              <p className="flex h-control items-center justify-end text-sm font-medium tabular-nums">{formatAmount(round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)))}</p>
              <Button variant="ghost" size="icon" aria-label="Remove line" leftIcon="delete-bin-line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-2">
          <Button size="sm" variant="ghost" leftIcon="add-line" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            Add line
          </Button>
          {errors.lines && <p className="px-2 text-[13px] text-destructive">{errors.lines}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Textarea label="Note on the invoice (optional)" rows={3} placeholder="e.g. Thank you for choosing PropFlow." value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        <dl className="space-y-1.5 self-end rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatAmount(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt>
              <Switch label={`Sales tax ${rate}%`} size="sm" checked={form.applyTax} onChange={set("applyTax")} className="text-muted-foreground" />
            </dt>
            <dd className="tabular-nums">{formatAmount(tax)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatAmount(total)}</dd>
          </div>
        </dl>
      </div>
      {editing && invoice.status !== "draft" && (
        <div className="rounded-lg border p-3">
          <Switch label="Email the updated invoice" description={billTo?.email ? `Sends it again to ${billTo.email}.` : "Sends it again to the workspace."} checked={form.sendEmail} onChange={set("sendEmail")} />
        </div>
      )}
    </Dialog>
  )
}

// "New invoice" button with its dialog; opens the invoice when saved
export function NewInvoiceButton({ workspace, workspaces = [], taxRate, variant = "default", className }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} leftIcon="file-add-line" className={className} onClick={() => setOpen(true)}>
        New invoice
      </Button>
      {open && (
        <InvoiceDialog
          workspace={workspace}
          workspaces={workspaces}
          taxRate={taxRate}
          onClose={() => setOpen(false)}
          onDone={(result, issued) => {
            setOpen(false)
            const note = issued ? (result.emailed ? "sent" : "email-failed") : "draft"
            router.push(`/billing/invoices/${urlCode(result.code)}?saved=${note}`)
          }}
        />
      )}
    </>
  )
}
