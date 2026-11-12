"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// "Type the deal, get the plan": the booking note an agent would scribble, on the dark half, and
// the payment schedule PropFlow makes of it on the light half. Editing the note changes the plan.

const rs = (n) => {
  if (n >= 1e7) return `Rs ${trim(n / 1e7)} crore`
  if (n >= 1e5) return `Rs ${trim(n / 1e5)} lac`
  return `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(n))}`
}
const trim = (v) => v.toFixed(2).replace(/\.?0+$/, "")
const num = (v, min, max) => Math.min(max, Math.max(min, Number(String(v).replace(/[^\d.]/g, "")) || 0))

export function PlanCalculator() {
  const [deal, setDeal] = useState({ marla: "10", price: "1.85", down: "25", possession: "10", count: "12", every: "quarterly" })
  const set = (k) => (e) => setDeal((d) => ({ ...d, [k]: e.target.value }))

  const plan = useMemo(() => {
    const price = num(deal.price, 0, 100) * 1e7
    const down = (price * num(deal.down, 0, 100)) / 100
    const possession = (price * num(deal.possession, 0, 100 - num(deal.down, 0, 100))) / 100
    const count = Math.round(num(deal.count, 1, 60))
    const each = Math.max(0, price - down - possession) / count
    const step = deal.every === "monthly" ? 1 : 3
    const start = new Date()
    const due = Array.from({ length: Math.min(count, 4) }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + step * (i + 1), 10)
      return { n: i + 1, date: d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }), amount: each }
    })
    const perMarla = num(deal.marla, 0, 400) ? price / num(deal.marla, 1, 400) : 0
    return { price, down, possession, count, each, due, perMarla }
  }, [deal])

  return (
    <div className="pf-card grid overflow-hidden lg:grid-cols-2">
      {/* What the agent types */}
      <div className="pf-navy flex flex-col p-7 sm:p-10">
        <p className="pf-eyebrow text-[var(--brand-bright)]">Booking note</p>
        <p className="mt-5 text-[clamp(1.2rem,1rem+0.7vw,1.45rem)] leading-[1.8] text-white">
          Plot 214, Block C. <Field label="Size in marla" value={deal.marla} onChange={set("marla")} w="2.2ch" /> marla at Rs <Field label="Price in crore" value={deal.price} onChange={set("price")} w="3.4ch" /> crore.{" "}
          <Field label="Down payment percent" value={deal.down} onChange={set("down")} w="2.2ch" />% down, <Field label="On possession percent" value={deal.possession} onChange={set("possession")} w="2.2ch" />% on possession, the rest in{" "}
          <Field label="Number of installments" value={deal.count} onChange={set("count")} w="2.2ch" />{" "}
          <select aria-label="How often" value={deal.every} onChange={set("every")} className="cursor-pointer appearance-none rounded-md border-b-2 border-white/40 bg-white/10 px-1.5 text-[var(--brand-bright)] focus:border-white focus:outline-none">
            <option value="quarterly" className="text-black">
              quarterly
            </option>
            <option value="monthly" className="text-black">
              monthly
            </option>
          </select>{" "}
          installments.
        </p>
        <p className="mt-auto flex items-center gap-2 pt-8 text-sm text-[var(--deep-muted)]">
          <Icon name="edit-line" aria-hidden /> Change any highlighted figure
        </p>
      </div>
      {/* What PropFlow makes of it */}
      <div data-ui aria-live="polite" className="p-7 text-[15px] sm:p-10">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-lg font-bold">Payment plan · Plot 214</p>
          <p className="text-[var(--text-2)]">{num(deal.marla, 0, 400)} marla</p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Price" value={rs(plan.price)} />
          <Stat label="Rate per marla" value={plan.perMarla ? rs(plan.perMarla) : "–"} />
          <Stat label="Down payment" value={rs(plan.down)} />
          <Stat label="On possession" value={rs(plan.possession)} />
        </dl>
        <p className="mt-6 font-semibold">
          {plan.count} {deal.every} installments of <span className="text-[var(--brand)]">{rs(plan.each)}</span>
        </p>
        <table className="mt-3 w-full text-left tabular-nums">
          <caption className="sr-only">First installments</caption>
          <thead className="text-[var(--text-2)]">
            <tr className="border-b border-[var(--line)]">
              <th className="py-2 font-medium">#</th>
              <th className="py-2 font-medium">Due</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {plan.due.map((d) => (
              <tr key={d.n} className="border-b border-[var(--line)]">
                <td className="py-2">{d.n}</td>
                <td className="py-2" suppressHydrationWarning>
                  {d.date}
                </td>
                <td className="py-2 text-right">{rs(d.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.count > 4 && <p className="mt-3 text-[var(--text-2)]">and {plan.count - 4} more, each with a reminder before it’s due</p>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, w }) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={value}
      onChange={onChange}
      className={cn("rounded-md border-b-2 border-white/40 bg-white/10 px-0.5 text-center font-semibold text-[var(--brand-bright)] tabular-nums focus:border-white focus:outline-none")}
      style={{ width: `calc(${w} + 0.6ch)` }}
    />
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-3.5 py-2.5">
      <dt className="text-[var(--text-2)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
