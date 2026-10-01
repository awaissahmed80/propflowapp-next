"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { EnquiryButton, TrialButton } from "./enquiry"

const rupees = (n) => `Rs ${new Intl.NumberFormat("en-PK").format(n)}`

// Plan cards from the console's plans. Yearly billing charges `yearlyMonths` months for 12.
// showPrices false: cards show "Price on request" and every button is Talk to sales
export function PricingPlans({ plans, yearlyMonths, popular, showPrices = true }) {
  const [yearly, setYearly] = useState(false)
  const free = 12 - yearlyMonths
  const last = plans.at(-1)?.code
  return (
    <>
      {showPrices && free > 0 && (
        <div className="mt-8 flex justify-center">
          <div role="radiogroup" aria-label="Billing" className="inline-flex rounded-full border bg-background p-1 text-sm">
            {[
              [false, "Monthly"],
              [true, "Yearly"],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={yearly === value}
                onClick={() => setYearly(value)}
                className={cn("flex h-9 items-center gap-2 rounded-full px-4 font-medium transition-colors", yearly === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
                {value && (
                  <span className={cn("rounded-full px-1.5 text-xs", yearly ? "bg-white/20" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400")}>
                    {free} month{free === 1 ? "" : "s"} free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={cn("mt-10 grid gap-6 md:grid-cols-2", plans.length >= 4 ? "xl:grid-cols-4" : plans.length === 3 && "lg:grid-cols-3")}>
        {plans.map((p) => {
          const hot = p.code === popular
          // The biggest plan is sold with a conversation, not a trial button
          const sales = !showPrices || (p.code === last && plans.length > 1)
          const price = showPrices ? (yearly ? Math.round((p.monthly * yearlyMonths) / 12) : p.monthly) : null
          return (
            <article key={p.code} className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs", hot && "border-primary shadow-lg ring-1 ring-primary")}>
              {hot && <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">Most popular</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.description}</p>
              {showPrices ? (
                <>
                  <p className="mt-5">
                    {sales && <span className="mr-1 text-sm text-muted-foreground">From</span>}
                    <span className="text-3xl font-bold tracking-tight tabular-nums">{rupees(price)}</span>
                    <span className="text-sm text-muted-foreground"> / month</span>
                  </p>
                  <p className="mt-1 h-5 text-xs text-muted-foreground">{yearly ? `${rupees(p.monthly * yearlyMonths)} billed yearly` : "Billed monthly"}</p>
                </>
              ) : (
                <>
                  <p className="mt-5 text-2xl font-bold tracking-tight">Price on request</p>
                  <p className="mt-1 h-5 text-xs text-muted-foreground">Monthly or yearly billing</p>
                </>
              )}
              <ul className="mt-5 flex flex-wrap gap-2">
                {p.limits.map((l) => (
                  <li key={l} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                    {l}
                  </li>
                ))}
              </ul>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Icon name="check-line" className="mt-0.5 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {sales ? (
                <EnquiryButton kind="sales" plan={p.name} source={`Pricing · ${p.name}`} className="mt-6 w-full" variant="outline">
                  Talk to sales
                </EnquiryButton>
              ) : (
                <TrialButton
                  plan={`${p.name}, ${yearly ? "yearly" : "monthly"}`}
                  signupPlan={{ plan: p.code, cycle: yearly ? "yearly" : "monthly" }}
                  source={`Pricing · ${p.name}`}
                  className="mt-6 w-full"
                  variant={hot ? "default" : "outline"}
                  leftIcon={null}
                />
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}
