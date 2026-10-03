"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PAYMENT_GATEWAYS } from "../payments"
import { savePaymentSettings } from "../server/actions"
import { toast } from "sonner"
import { toastAction } from "@/lib/toast-action"

function BankDetails({ bank, onChange, errors, disabled }) {
  const field = (key, label, props = {}) => <Input label={label} value={bank[key]} disabled={disabled} onChange={(e) => onChange({ ...bank, [key]: e.target.value })} error={errors[key]} {...props} />
  return (
    <div className="grid gap-4 border-t px-5 py-4 sm:grid-cols-2">
      {field("bankName", "Bank", { placeholder: "Meezan Bank" })}
      {field("accountTitle", "Account title", { placeholder: "PropFlow (Pvt) Ltd" })}
      {field("iban", "IBAN", { placeholder: "PK36 MEZN 0001 2345 6789 0123", className: "font-mono" })}
      {field("accountNumber", "Account number", { placeholder: "Optional" })}
      <div className="sm:col-span-2">{field("branch", "Branch", { placeholder: "Optional, e.g. Gulberg III, Lahore" })}</div>
      <div className="sm:col-span-2">
        <Textarea
          label="Instructions for customers"
          rows={2}
          placeholder="Use your invoice number as the payment reference. Payments are confirmed within one working day."
          value={bank.instructions}
          disabled={disabled}
          onChange={(e) => onChange({ ...bank, instructions: e.target.value })}
        />
      </div>
    </div>
  )
}

export function PaymentMethodsView({ settings, editable }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(() => Object.fromEntries(settings.methods.map((m) => [m.id, m.enabled])))
  const [bank, setBank] = useState(settings.bank)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const status = Object.fromEntries(settings.methods.map((m) => [m.id, m]))
  const noneOn = !Object.values(enabled).some(Boolean)

  const save = () =>
    startTransition(async () => {
      setErrors({})
      const result = await toastAction(() => savePaymentSettings({ enabled, bank }), {
        loading: "Saving…",
        success: (r) => (r.noneEnabled ? "Saved. No payment method is on, so customers can't pay yet." : "Payment methods saved."),
      })
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        toast.error("Fill in the bank details before switching bank transfer on.")
      } else if (!result.error) router.refresh()
    })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Payment Methods"
        description="How customers can pay for their subscription"
        actions={
          editable && (
            <Button leftIcon="save-line" loading={pending} onClick={save}>
              Save changes
            </Button>
          )
        }
      />
      {noneOn && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Icon name="error-warning-line" className="mt-0.5" />
          No payment method is on. Trials still work, but customers can&apos;t pay when their trial ends.
        </p>
      )}

      <div className="max-w-3xl space-y-4">
        {PAYMENT_GATEWAYS.map((g) => {
          const s = status[g.id]
          const on = enabled[g.id]
          return (
            <section key={g.id} className={cn("rounded-xl border bg-background shadow-xs", on && "border-primary/40")}>
              <div className="flex items-start gap-4 px-5 py-4">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg", on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Icon name={g.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{g.label}</h2>
                    {g.manual ? (
                      <Badge color="gray">Manual</Badge>
                    ) : s.configured ? (
                      <Badge color="green" dot>
                        Keys added
                      </Badge>
                    ) : (
                      <Badge color="gray">Not set up</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{g.description}</p>
                  {!s.configured && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      To use it, add these to the server&apos;s .env and restart: <span className="font-mono">{s.missing.join(", ")}</span>
                    </p>
                  )}
                </div>
                <Switch aria-label={`${g.label} on or off`} checked={on} disabled={!editable || !s.configured} onChange={(v) => setEnabled((e) => ({ ...e, [g.id]: v }))} />
              </div>
              {g.manual && (on || bank.iban || bank.bankName) && <BankDetails bank={bank} onChange={setBank} errors={errors} disabled={!editable} />}
            </section>
          )
        })}
        {settings.updatedAt && <p className="text-xs text-muted-foreground">Last changed {formatDateTime(settings.updatedAt)}. Changes are recorded in the audit log.</p>}
      </div>
    </div>
  )
}
