"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { NumberInput } from "@/components/ui/number-input"
import { quote } from "../dynamic-pricing"

// "Your package" in the create-workspace wizard when dynamic pricing is on: the base package, the
// apps their answers suggest (they can add or remove any), how many users, monthly or yearly, and
// the price as it changes. Controlled: value { apps, users, cycle } / onChange(next).
//   config: { pricing, catalog, yearlyMonths } from getDynamicPricing()

export const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`

export function usePackageQuote(config, value) {
  return useMemo(() => quote(config.pricing, value, { catalog: config.catalog, yearlyMonths: config.yearlyMonths }), [config, value])
}

export function PackageEditor({ config, value, onChange, suggested = [] }) {
  const { pricing, catalog, yearlyMonths } = config
  const base = catalog.filter((a) => pricing.baseApps.includes(a.code))
  const optional = catalog.filter((a) => !pricing.baseApps.includes(a.code) && pricing.appPrices[a.code] != null)
  const q = usePackageQuote(config, value)
  const yearlySaving = yearlyMonths < 12 ? 12 - yearlyMonths : 0
  const set = (patch) => onChange({ ...value, ...patch })
  const toggle = (code) => set({ apps: value.apps.includes(code) ? value.apps.filter((c) => c !== code) : [...value.apps, code] })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Every workspace</span>
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{rs(pricing.baseMonthly)}</span> a month · {pricing.baseUsers} users
            </span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[{ code: "desk", name: "My Desk", icon: "user-smile-line", color: "teal" }, ...base].map((a) => (
              <li key={a.code} className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs">
                <AppIcon icon={a.icon} color={a.color} size="sm" className="size-5 rounded-full text-[10px]" />
                {a.name}
              </li>
            ))}
          </ul>
        </div>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {optional.map((a) => {
            const on = value.apps.includes(a.code)
            return (
              <li key={a.code}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a.code)}
                  className={cn(
                    "flex h-full w-full cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
                    on && "border-primary ring-1 ring-primary",
                  )}
                >
                  <AppIcon icon={a.icon} color={a.color} size="sm" className="size-9 rounded-lg text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Icon name={on ? "checkbox-circle-fill" : "checkbox-blank-circle-line"} className={cn("shrink-0 text-xl", on ? "text-primary" : "text-muted-foreground/40")} />
                    </span>
                    {suggested.includes(a.code) && <span className="block text-xs font-medium text-primary">Suggested from your answers</span>}
                    <span className="mt-1 block text-sm tabular-nums">
                      {rs(pricing.appPrices[a.code])}
                      <span className="text-muted-foreground"> a month</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <span className="text-sm">
            <span className="block font-medium">How many people will use it?</span>
            <span className="block text-muted-foreground">
              {pricing.baseUsers} included, then {rs(pricing.userPrice)} per user a month
            </span>
          </span>
          <NumberInput aria-label="Users" className="w-36" value={value.users} min={pricing.baseUsers} max={pricing.maxUsers} onChange={(v) => set({ users: v ?? pricing.baseUsers })} />
        </div>
      </div>

      <aside className="h-fit rounded-xl border bg-background p-4 shadow-sm lg:sticky lg:top-24">
        {yearlySaving > 0 && (
          <div role="radiogroup" aria-label="Billing" className="mb-3 grid grid-cols-2 rounded-full border p-1 text-xs">
            {[
              ["monthly", "Monthly"],
              ["yearly", `Yearly · ${yearlySaving} months free`],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={value.cycle === v}
                onClick={() => set({ cycle: v })}
                className={cn("h-7 rounded-full px-2 font-medium", value.cycle === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <ul className="space-y-1 text-sm">
          {q.lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span className="min-w-0 text-muted-foreground">{l.label.startsWith("Base:") ? "Base package" : l.label}</span>
              <span className="tabular-nums">{rs(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t pt-3">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{value.cycle === "yearly" ? "A month, billed yearly" : "A month"}</span>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{rs(value.cycle === "yearly" ? q.cycleTotal / 12 : q.monthly)}</span>
          </p>
          {value.cycle === "yearly" && <p className="text-right text-xs text-muted-foreground tabular-nums">{rs(q.cycleTotal)} a year</p>}
          <p className="mt-1 text-right text-xs text-muted-foreground">{q.users} users · before taxes</p>
        </div>
      </aside>
    </div>
  )
}
