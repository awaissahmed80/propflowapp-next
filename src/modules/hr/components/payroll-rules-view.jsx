"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { DEFAULT_RULES, annualTax } from "../constants"
import { savePayrollRules } from "../server/actions"
import { rs } from "./people-parts"

const money = { prefix: "Rs", min: 0, step: 1000, format: { maximumFractionDigits: 0 } }
const pct = (max = 100, step = 0.5) => ({ suffix: "%", min: 0, max, step })

// HR › Customize › Payroll rules: salary tax slabs (with a calculator), minimum wage, EOBI,
// provident fund, the medical allowance exemption and yearly leave.
//   rules: hrRules() · canEdit: hr edit (the page already needs hr.payroll)
export function PayrollRulesView({ rules, canEdit }) {
  const router = useRouter()
  const types = useList("leave-type")
  const [r, setR] = useState(rules)
  const [probe, setProbe] = useState(150000)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(r) !== JSON.stringify(rules)
  useUnsavedGuard(dirty)
  const readOnly = !canEdit
  const set = (p) => setR((x) => ({ ...x, ...p }))
  const setSlab = (i, p) => set({ slabs: r.slabs.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  const addSlab = () => {
    const open = r.slabs.length - 1
    const before = r.slabs[open - 1]?.upTo ?? 0
    set({ slabs: [...r.slabs.slice(0, open), { upTo: before + 1_000_000, fixed: r.slabs[open].fixed, rate: r.slabs[open].rate }, r.slabs[open]] })
  }
  const yearly = annualTax(Math.max(0, probe) * 12, r.slabs)
  const leaveTypes = Object.keys(r.leave)

  const save = () =>
    startTransition(async () => {
      const res = await toastAction(() => savePayrollRules(r), { loading: "Saving…", success: "Payroll rules saved. Draft payrolls use them when rebuilt; paid ones keep theirs." })
      if (res?.ok) router.refresh()
    })

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Payroll rules"
        description="Salary tax slabs, minimum wage, EOBI, provident fund and leave allowed each year."
        actions={
          canEdit && (
            <>
              <Button
                variant="ghost"
                leftIcon="restart-line"
                disabled={pending}
                onClick={async () =>
                  (await confirm({ title: "Start from PropFlow's rules?", description: `The ${DEFAULT_RULES.taxYear} slabs and rates. Nothing is saved until you save.`, confirmLabel: "Use them" })) &&
                  setR(structuredClone(DEFAULT_RULES))
                }
              >
                Defaults
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={async () => (await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true })) && setR(rules)}
                >
                  Discard
                </Button>
              )}
              <Button leftIcon="check-line" loading={pending} disabled={!dirty} onClick={save}>
                Save changes
              </Button>
            </>
          )
        }
      />
      <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
        <Icon name="error-warning-line" className="mt-0.5" /> Tax slabs, the minimum wage and EOBI rates change with each budget. Check them against the Finance Act and your province&apos;s notification every July.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Salary tax slabs"
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tax year</span>
              <Input aria-label="Tax year" size="sm" className="w-24" value={r.taxYear} disabled={readOnly} onChange={(e) => set({ taxYear: e.target.value })} />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">Yearly taxable income up to</th>
                  <th className="pb-2 text-left font-medium">Fixed tax</th>
                  <th className="pb-2 text-left font-medium">Rate on the excess</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {r.slabs.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      {s.upTo == null ? (
                        <span className="text-muted-foreground">Above {rs(r.slabs[i - 1]?.upTo ?? 0)}</span>
                      ) : (
                        <NumberInput aria-label={`Slab ${i + 1} up to`} {...money} step={100000} value={s.upTo} disabled={readOnly} onChange={(v) => setSlab(i, { upTo: v ?? 0 })} />
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <NumberInput aria-label={`Slab ${i + 1} fixed tax`} {...money} value={s.fixed} disabled={readOnly} onChange={(v) => setSlab(i, { fixed: v ?? 0 })} />
                    </td>
                    <td className="py-1 pr-2">
                      <NumberInput aria-label={`Slab ${i + 1} rate`} {...pct(60)} value={s.rate} disabled={readOnly} onChange={(v) => setSlab(i, { rate: v ?? 0 })} />
                    </td>
                    <td>
                      {!readOnly && s.upTo != null && r.slabs.length > 2 && <IconButton icon="delete-bin-6-line" aria-label={`Remove slab ${i + 1}`} onClick={() => set({ slabs: r.slabs.filter((_, j) => j !== i) })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <Button variant="ghost" size="sm" leftIcon="add-line" className="mt-1" onClick={addSlab}>
              Add a slab
            </Button>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
            <NumberInput className="w-52" label="Try a monthly taxable salary" {...money} value={probe} onChange={(v) => setProbe(v ?? 0)} />
            <p className="pb-2 text-sm">
              <span className="font-medium tabular-nums">{rs(Math.round(yearly / 12))}</span> <span className="text-muted-foreground">a month · {rs(yearly)} a year</span>
              {probe > 0 && <span className="block text-xs text-muted-foreground">{((yearly / (probe * 12)) * 100).toFixed(1)}% of taxable income</span>}
            </p>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Minimum wage, EOBI and provident fund">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberInput label="Minimum monthly wage" {...money} value={r.minimumWage} disabled={readOnly} onChange={(v) => set({ minimumWage: v ?? 0 })} />
              <p className="self-end pb-2 text-xs text-muted-foreground">Salaries below it can&apos;t be saved (daily-wage staff aside). EOBI is worked out on it.</p>
              <NumberInput label="EOBI, employee" {...pct(20)} value={r.eobiEmployeePct} disabled={readOnly} onChange={(v) => set({ eobiEmployeePct: v ?? 0 })} />
              <NumberInput label="EOBI, employer" {...pct(20)} value={r.eobiEmployerPct} disabled={readOnly} onChange={(v) => set({ eobiEmployerPct: v ?? 0 })} />
              <NumberInput label="Provident fund, employee" suffix="% of basic" min={0} max={20} step={0.01} value={r.pfEmployeePct} disabled={readOnly} onChange={(v) => set({ pfEmployeePct: v ?? 0 })} />
              <NumberInput label="Provident fund, employer" suffix="% of basic" min={0} max={20} step={0.01} value={r.pfEmployerPct} disabled={readOnly} onChange={(v) => set({ pfEmployerPct: v ?? 0 })} />
              <NumberInput label="Medical allowance tax-free up to" suffix="% of basic" min={0} max={100} step={1} value={r.medicalExemptPct} disabled={readOnly} onChange={(v) => set({ medicalExemptPct: v ?? 0 })} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              EOBI each month: {rs((r.minimumWage * r.eobiEmployeePct) / 100)} from the employee, {rs((r.minimumWage * r.eobiEmployerPct) / 100)} from you.
            </p>
          </SectionCard>
          <SectionCard title="Leave allowed each year">
            <div className="grid gap-4 sm:grid-cols-3">
              {leaveTypes.map((type) => (
                <NumberInput key={type} label={types.label(type)} suffix="days" min={0} max={60} value={r.leave[type]} disabled={readOnly} onChange={(v) => set({ leave: { ...r.leave, [type]: v ?? 0 } })} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Unpaid leave has no allowance: a day&apos;s pay is deducted for each day.</p>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
