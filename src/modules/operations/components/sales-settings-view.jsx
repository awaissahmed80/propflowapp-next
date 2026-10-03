"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { saveSalesSettings } from "../server/setup-actions"

// Sales › Customize › Settings: documents before each step, when a buyer counts as a defaulter,
// the default deduction on cancellation, and commission rates

function Setting({ title, text, children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-72">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SalesSettingsView({ settings }) {
  const router = useRouter()
  const [form, setForm] = useState(settings)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => saveSalesSettings(form), { loading: "Saving settings…", success: "Settings saved." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (!r?.error) router.refresh()
    })

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Rules & commissions"
        description="How bookings move along, when buyers count as defaulters, and commissions"
        actions={
          dirty && (
            <>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () =>
                  (await confirm({ title: "Discard unsaved changes?", description: "Your changes to the sales settings will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true })) &&
                  setForm(settings)
                }
              >
                Discard
              </Button>
              <Button leftIcon="check-line" loading={pending} onClick={save}>
                Save changes
              </Button>
            </>
          )
        }
      />

      <section className="divide-y rounded-xl border bg-background shadow-xs">
        <Setting title="Required documents hold up each step" text="The allotment letter, handover and possession wait until that step's required booking documents are uploaded.">
          <Switch aria-label="Required documents hold up each step" checked={form.enforceDocuments} onChange={(on) => set({ enforceDocuments: on })} />
        </Setting>
        <Setting title="Defaulter after missed payments" text="A booking becomes Defaulter when this many installments are overdue…">
          <NumberInput aria-label="Overdue payments" size="sm" className="w-40" min={1} max={24} suffix="payments" value={form.defaulterLines} onChange={(n) => set({ defaulterLines: n ?? 1 })} />
          {errors.defaulterLines && <p className="mt-1 text-xs text-destructive">{errors.defaulterLines}</p>}
        </Setting>
        <Setting title="…or days late" text="…or when its oldest unpaid installment is this late.">
          <NumberInput aria-label="Days late" size="sm" className="w-40" min={7} max={365} suffix="days" value={form.defaulterDays} onChange={(n) => set({ defaulterDays: n ?? 7 })} />
          {errors.defaulterDays && <p className="mt-1 text-xs text-destructive">{errors.defaulterDays}</p>}
        </Setting>
        <Setting title="Deduction on cancellation" text="Kept from the amount paid when a booking is canceled; can be changed per cancellation.">
          <NumberInput aria-label="Deduction" size="sm" className="w-40" min={0} max={100} suffix="%" value={form.deductionPct} onChange={(n) => set({ deductionPct: n ?? 0 })} />
          {errors.deductionPct && <p className="mt-1 text-xs text-destructive">{errors.deductionPct}</p>}
        </Setting>
      </section>

      <h2 className="pt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Commissions</h2>
      <section className="divide-y rounded-xl border bg-background shadow-xs">
        <Setting title="Dealer commission" text="Of the net price, when a dealer brought the buyer. A dealer's own agreed rate (Users & Teams › Dealers) wins.">
          <NumberInput aria-label="Dealer commission" size="sm" className="w-40" min={0} max={20} step={0.25} suffix="%" value={form.dealerCommissionPct} onChange={(n) => set({ dealerCommissionPct: n ?? 0 })} />
          {errors.dealerCommissionPct && <p className="mt-1 text-xs text-destructive">{errors.dealerCommissionPct}</p>}
        </Setting>
        <Setting title="Agent commission" text="Of the net price, for the in-house agent who sold it when no dealer was involved.">
          <NumberInput aria-label="Agent commission" size="sm" className="w-40" min={0} max={20} step={0.25} suffix="%" value={form.agentCommissionPct} onChange={(n) => set({ agentCommissionPct: n ?? 0 })} />
          {errors.agentCommissionPct && <p className="mt-1 text-xs text-destructive">{errors.agentCommissionPct}</p>}
        </Setting>
        <Setting title="Payable once" text="Commission waits until the booking gets this far. Canceled before payout: it's void; after: it's marked to recover.">
          <Select
            aria-label="Payable once"
            size="sm"
            triggerClassName="w-52"
            value={form.commissionTrigger}
            onChange={(v) => set({ commissionTrigger: v })}
            options={[
              { value: "token", label: "The token is received" },
              { value: "down-payment", label: "The down payment is in" },
              { value: "allotment", label: "The allotment letter is issued" },
            ]}
          />
        </Setting>
        <Setting title="Tax withheld on dealers" text="Income tax deducted from dealer commission (section 233). Can be changed on each payout. Agents are paid with salary.">
          <NumberInput aria-label="Tax withheld" size="sm" className="w-40" min={0} max={50} step={0.5} suffix="%" value={form.dealerWhtPct} onChange={(n) => set({ dealerWhtPct: n ?? 0 })} />
          {errors.dealerWhtPct && <p className="mt-1 text-xs text-destructive">{errors.dealerWhtPct}</p>}
        </Setting>
      </section>
    </div>
  )
}
