"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { useList, useMeasures } from "@/modules/lookups/context"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Tooltip } from "@/components/ui/tooltip"
import { CHARGE_BASES, FREQUENCIES, NEW_PLAN, chargeText, installmentPct, isCashPlan, nextKey, planLength, planProblems, planSummary, rateBasis, rateFor, ratePrice, rateSize } from "../pricing"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const UNSOLD = ["available", "on-hold", "blocked"]
const sizeOrder = (r, m) => (r.sizeValue == null ? Infinity : (m.sizeInMarla(r.sizeValue, r.sizeUnit) ?? r.sizeValue))

// ---------- rates ----------

// The last row of the rates table: type, size (or any size), category and rate, lined up with the columns
function AddRateRow({ rates, marlaSqft, onAdd }) {
  const types = useList("unit-type")
  const m = useMeasures()
  const categories = useList("block-category")
  const [type, setType] = useState("plot")
  const [category, setCategory] = useState("residential")
  const [value, setValue] = useState(null)
  const [unit, setUnit] = useState("marla") // an area unit, or "any"
  const [rate, setRate] = useState(null)
  const areaUnits = useList("area-unit")
  const allowed = m.unitsFor(type)
  const any = unit === "any"
  const sizeUnit = any ? null : allowed.includes(unit) ? unit : allowed[0]
  const row = { type, category, sizeValue: any ? null : value, sizeUnit }
  const duplicate = rates.some((r) => r.type === row.type && r.category === row.category && (r.sizeValue ?? null) === row.sizeValue && (r.sizeUnit ?? null) === row.sizeUnit)
  const ready = (any || value > 0) && !duplicate
  const basis = rateBasis(type, m)
  const price = !any && value > 0 && rate > 0 ? ratePrice({ ...row, rate }, marlaSqft, m) : null
  const add = () => {
    if (!ready) return
    onAdd({ ...row, rate: rate ?? 0 })
    setValue(null)
    setRate(null)
  }
  return (
    <tr className="border-t bg-muted/30 align-top">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Select aria-label="Unit type" size="sm" triggerClassName="w-32" value={type} onChange={setType} options={types.options} />
          {!any && <NumberInput aria-label="Size" size="sm" className="w-24" min={0} placeholder="Size" value={value} onChange={setValue} />}
          <Select
            aria-label="Size unit"
            size="sm"
            triggerClassName="w-28"
            value={any ? "any" : sizeUnit}
            onChange={setUnit}
            options={[...allowed.map((u) => ({ value: u, label: areaUnits.map[u]?.meta?.short || areaUnits.label(u) })), { value: "any", label: "Any size" }]}
          />
        </div>
        {duplicate && <p className="mt-1.5 text-xs text-destructive">{any ? "This type already has an any-size rate." : "This size already has a rate."}</p>}
      </td>
      <td className="px-4 py-2.5">
        <Select aria-label="Category" size="sm" triggerClassName="w-36" value={category} onChange={setCategory} options={categories.options} />
      </td>
      <td className="px-4 py-2.5">
        <NumberInput
          className="ml-auto w-60"
          aria-label="Base rate"
          size="sm"
          min={0}
          step={basis === "marla" ? 25_000 : 500}
          prefix="Rs"
          suffix={basis === "marla" ? "/marla" : "/sqft"}
          format={{ maximumFractionDigits: 0 }}
          placeholder="Rate"
          value={rate}
          onChange={setRate}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
        <span className="flex h-control-sm items-center justify-end text-muted-foreground">{price ? formatPkr(price) : any ? "By size" : "—"}</span>
      </td>
      <td className="hidden md:table-cell" />
      <td className="px-2 py-2.5 text-right">
        <Button size="icon" leftIcon="add-line" aria-label="Add rate" title="Add rate" disabled={!ready} onClick={add} />
      </td>
    </tr>
  )
}

// Base rate per unit type and size (or any size). Editable while the list is a draft.
export function RatesTab({ list, units, marlaSqft, editing, onChange }) {
  const types = useList("unit-type")
  const m = useMeasures()
  const categories = useList("block-category")
  const unsold = units.filter((u) => UNSOLD.includes(u.status))
  const counts = new Map()
  for (const u of unsold) {
    const r = rateFor(list.rates, u)
    if (r) counts.set(r.key, (counts.get(r.key) ?? 0) + 1)
  }
  // Unsold sizes with no rate: offer to add them
  const missing = new Map()
  for (const u of unsold)
    if (!rateFor(list.rates, u)) {
      const k = `${u.type}|${u.category}|${u.sizeValue}|${u.sizeUnit}`
      missing.set(k, { type: u.type, category: u.category, sizeValue: u.sizeValue, sizeUnit: u.sizeUnit, count: (missing.get(k)?.count ?? 0) + 1 })
    }
  const rows = [...list.rates].sort((a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || sizeOrder(a, m) - sizeOrder(b, m))
  const add = (row) => onChange([...list.rates, { key: nextKey("r", list.rates), ...row }])
  const addMissing = () => {
    let next = [...list.rates]
    for (const x of missing.values()) next = [...next, { key: nextKey("r", next), type: x.type, category: x.category, sizeValue: x.sizeValue, sizeUnit: x.sizeUnit, rate: 0 }]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {missing.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Icon name="error-warning-line" />
          <span className="flex-1">
            No rate for{" "}
            {[...missing.values()]
              .slice(0, 4)
              .map((x) => `${x.count} × ${types.label(x.type)} ${m.formatSize(x.sizeValue, x.sizeUnit)}`)
              .join(", ")}
            {missing.size > 4 ? "…" : ""}. Those units keep their current price.
          </span>
          {editing && (
            <Button size="sm" variant="outline" leftIcon="add-line" onClick={addMissing}>
              Add {missing.size === 1 ? "this size" : "these sizes"}
            </Button>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Unit</th>
                <th className="px-4 py-2.5 text-left font-medium">Category</th>
                <th className="px-4 py-2.5 text-right font-medium">Base rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Price per unit</th>
                <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Unsold units</th>
                {editing && <th className="w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No rates yet. Add one for each unit type and size you sell, or one for any size.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const basis = rateBasis(r.type, m)
                const price = ratePrice(r, marlaSqft, m)
                return (
                  <tr key={r.key} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Icon name={types.map[r.type]?.icon ?? "home-line"} className="text-base text-muted-foreground" />
                        <span className="font-medium">{types.label(r.type)}</span>
                        <span className={cn("text-muted-foreground", r.sizeValue == null && "italic")}>{rateSize(r, m)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{categories.label(r.category)}</td>
                    <td className="px-4 py-2 text-right">
                      {editing ? (
                        <NumberInput
                          className="ml-auto w-60"
                          aria-label={`Rate for ${types.label(r.type)} ${rateSize(r, m)}`}
                          size="sm"
                          min={0}
                          step={basis === "marla" ? 25_000 : 500}
                          prefix="Rs"
                          suffix={basis === "marla" ? "/marla" : "/sqft"}
                          format={{ maximumFractionDigits: 0 }}
                          value={r.rate || null}
                          onChange={(v) => onChange(list.rates.map((x) => (x.key === r.key ? { ...x, rate: v ?? 0 } : x)))}
                        />
                      ) : (
                        <span className="whitespace-nowrap tabular-nums">
                          {basis === "marla" ? formatPkr(r.rate) : `Rs ${number(r.rate)}`}
                          <span className="text-muted-foreground">{basis === "marla" ? "/marla" : "/sq ft"}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {price ? formatPkr(price) : <span className="font-normal text-muted-foreground">{r.sizeValue == null ? "By size" : "—"}</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-muted-foreground tabular-nums md:table-cell">{counts.get(r.key) ?? 0}</td>
                    {editing && (
                      <td className="px-2 text-right">
                        <Button variant="ghost" size="icon" leftIcon="close-line" aria-label="Remove rate" onClick={() => onChange(list.rates.filter((x) => x.key !== r.key))} />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            {editing && (
              <tfoot>
                <AddRateRow rates={list.rates} marlaSqft={marlaSqft} onAdd={add} />
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">An &quot;Any size&quot; rate prices every size of that type without its own rate, such as series with mixed sizes.</p>
    </div>
  )
}

// ---------- premiums & charges ----------

export function ChargesTab({ list, editing, building, onChange }) {
  const features = useList("feature")
  const missing = features.options.filter((o) => !list.premiums.some((p) => p.feature === o.value))
  const setCharge = (key, patch) => onChange({ charges: list.charges.map((c) => (c.key === key ? { ...c, ...patch } : c)) })
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <SectionCard
        title="Premium locations"
        bodyClassName="p-0"
        action={
          editing &&
          missing.length > 0 && (
            <DropdownMenu
              align="end"
              items={missing.map((o) => ({ key: o.value, label: o.label, onClick: () => onChange({ premiums: [...list.premiums, { feature: o.value, percent: Number(features.map[o.value]?.meta?.premium ?? 0) }] }) }))}
              trigger={
                <Button size="sm" variant="ghost" leftIcon="add-line" className="text-primary">
                  Add
                </Button>
              }
            />
          )
        }
      >
        <ul className="divide-y">
          {list.premiums.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No premium locations. Features not listed here use their default % from Lists &amp; Labels.</li>}
          {list.premiums.map((p) => (
            <li key={p.feature} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                {features.map[p.feature]?.icon && <Icon name={features.map[p.feature].icon} className="text-muted-foreground" />}
                {features.label(p.feature)}
              </span>
              {editing ? (
                <span className="flex items-center gap-1">
                  <NumberInput
                    className="w-28"
                    size="sm"
                    aria-label={`${features.label(p.feature)} premium`}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    value={p.percent}
                    onChange={(v) => onChange({ premiums: list.premiums.map((x) => (x.feature === p.feature ? { ...x, percent: v ?? 0 } : x)) })}
                  />
                  <Button variant="ghost" size="icon" leftIcon="close-line" aria-label="Remove premium" onClick={() => onChange({ premiums: list.premiums.filter((x) => x.feature !== p.feature) })} />
                </span>
              ) : (
                <span className="font-medium tabular-nums">+{p.percent}%</span>
              )}
            </li>
          ))}
          {(building || list.floorRisePct > 0) && (
            <li className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-2.5 text-sm">
              <span>
                Floor rise
                <span className="block text-xs text-muted-foreground">Added per floor above ground</span>
              </span>
              {editing ? (
                <NumberInput className="w-28" size="sm" aria-label="Floor rise per floor" min={0} max={10} step={0.5} suffix="%" value={list.floorRisePct} onChange={(v) => onChange({ floorRisePct: v ?? 0 })} />
              ) : (
                <span className="font-medium tabular-nums">+{list.floorRisePct}% / floor</span>
              )}
            </li>
          )}
        </ul>
      </SectionCard>

      <SectionCard
        title="Other charges"
        bodyClassName="p-0"
        action={
          editing && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon="add-line"
              className="text-primary"
              onClick={() => onChange({ charges: [...list.charges, { key: nextKey("c", list.charges), name: "", basis: "fixed", amount: 0, due: "At possession" }] })}
            >
              Add charge
            </Button>
          )
        }
      >
        {editing ? (
          <div className="divide-y">
            {list.charges.map((c) => (
              <div key={c.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_9rem_9rem_minmax(0,1fr)_auto] sm:items-end">
                <Input label="Charge" size="sm" placeholder="e.g. Development charges" value={c.name} onChange={(e) => setCharge(c.key, { name: e.target.value })} />
                <Select label="Basis" size="sm" value={c.basis} onChange={(basis) => setCharge(c.key, { basis })} options={CHARGE_BASES} />
                <NumberInput
                  label="Amount"
                  size="sm"
                  min={0}
                  value={c.amount}
                  suffix={c.basis === "percent" ? "%" : undefined}
                  prefix={c.basis === "percent" ? undefined : "Rs"}
                  format={{ maximumFractionDigits: 2 }}
                  onChange={(v) => setCharge(c.key, { amount: v ?? 0 })}
                />
                <Input label="Due" size="sm" placeholder="e.g. At possession" value={c.due} onChange={(e) => setCharge(c.key, { due: e.target.value })} />
                <Button variant="ghost" size="icon" leftIcon="close-line" aria-label="Remove charge" onClick={() => onChange({ charges: list.charges.filter((x) => x.key !== c.key) })} />
              </div>
            ))}
            {list.charges.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No other charges.</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Charge</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.charges.map((c) => (
                <tr key={c.key}>
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{chargeText(c)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.due}</td>
                </tr>
              ))}
              {list.charges.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    No other charges.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}

// ---------- payment plans ----------

export const PLAN_PARTS = { down: "bg-primary", installment: "bg-sky-400", balloon: "bg-violet-400", possession: "bg-emerald-500" }

// How the price is split: down / installments / balloon / possession
export function PlanBar({ plan }) {
  const parts = isCashPlan(plan)
    ? [{ label: "Full payment", pct: 100, cls: PLAN_PARTS.down }]
    : [
        { label: "Down payment", pct: plan.downPaymentPct, cls: PLAN_PARTS.down },
        { label: "Installments", pct: installmentPct(plan), cls: PLAN_PARTS.installment },
        { label: "Balloon", pct: plan.balloonCount ? plan.balloonPct : 0, cls: PLAN_PARTS.balloon },
        { label: "On possession", pct: plan.possessionPct, cls: PLAN_PARTS.possession },
      ].filter((p) => p.pct > 0)
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <Tooltip key={p.label} side="top" content={`${p.label}: ${p.pct}%`}>
            <span className={cn("h-full", p.cls)} style={{ width: `${p.pct}%` }} />
          </Tooltip>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.cls)} />
            {p.label} <span className="font-medium text-foreground tabular-nums">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlanCard({ plan, editing, onChange, onRemove }) {
  const set = (field) => (v) => onChange({ ...plan, [field]: v ?? 0 })
  const problems = planProblems(plan)
  const cash = isCashPlan(plan)
  return (
    <article className="flex flex-col rounded-xl border bg-background p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="min-w-0 flex-1">
            <Input aria-label="Plan name" size="sm" value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} />
          </div>
        ) : (
          <div>
            <h3 className="font-semibold">{plan.name}</h3>
            <p className="text-xs text-muted-foreground">{planSummary(plan)}</p>
          </div>
        )}
        {editing && <Button variant="ghost" size="icon" leftIcon="delete-bin-6-line" aria-label="Remove plan" onClick={onRemove} />}
      </div>
      <div className="mt-4">
        <PlanBar plan={plan} />
      </div>
      {editing ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberInput label="Down payment" size="sm" min={0} max={100} suffix="%" value={plan.downPaymentPct} onChange={set("downPaymentPct")} />
          <NumberInput label="Cash discount" size="sm" min={0} max={50} suffix="%" value={plan.discountPct} onChange={set("discountPct")} info="For full payment" />
          {plan.downPaymentPct < 100 && (
            <>
              <NumberInput label="Installments" size="sm" min={0} max={240} value={plan.installments} onChange={set("installments")} />
              <Select label="Frequency" size="sm" value={plan.frequency} onChange={(v) => onChange({ ...plan, frequency: v })} options={FREQUENCIES} />
              <NumberInput label="Balloon payments" size="sm" min={0} max={40} value={plan.balloonCount} onChange={set("balloonCount")} />
              <NumberInput label="Balloon share" size="sm" min={0} max={100} suffix="%" value={plan.balloonPct} onChange={set("balloonPct")} />
              <NumberInput label="On possession" size="sm" min={0} max={100} suffix="%" value={plan.possessionPct} onChange={set("possessionPct")} />
            </>
          )}
          <div className="col-span-2">
            <Input label="Note" size="sm" placeholder="e.g. Full payment within 30 days of booking" value={plan.note ?? ""} onChange={(e) => onChange({ ...plan, note: e.target.value })} />
          </div>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {cash ? (
            <>
              <div>
                <dt className="text-xs text-muted-foreground">Payment</dt>
                <dd className="font-medium">Full, at booking</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Discount</dt>
                <dd className="font-medium tabular-nums">{plan.discountPct ?? 0}%</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="font-medium">{planLength(plan)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Installments</dt>
                <dd className="font-medium">
                  {plan.installments} × {FREQUENCIES.find((f) => f.value === plan.frequency)?.label.toLowerCase()}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
      {plan.note && !editing && <p className="mt-3 text-xs text-muted-foreground">{plan.note}</p>}
      {editing && problems.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-destructive">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <Icon name="error-warning-line" className="mt-px" /> {p}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export function PlansTab({ list, editing, onChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {list.plans.map((p) => (
        <PlanCard key={p.key} plan={p} editing={editing} onChange={(next) => onChange(list.plans.map((x) => (x.key === p.key ? next : x)))} onRemove={() => onChange(list.plans.filter((x) => x.key !== p.key))} />
      ))}
      {editing && (
        <button
          type="button"
          onClick={() => onChange([...list.plans, { ...NEW_PLAN, key: nextKey("p", list.plans) }])}
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="add-line" className="text-xl" />
          Add payment plan
        </button>
      )}
      {!editing && list.plans.length === 0 && <p className="text-sm text-muted-foreground">No payment plans in this list.</p>}
    </div>
  )
}
