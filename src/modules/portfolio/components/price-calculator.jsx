"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { formatAmount, formatDate, formatPkr } from "@/lib/format"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { urlCode } from "@/lib/url"
import { useList, useMeasures } from "@/modules/lookups/context"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/datetimepicker"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { AreaUnitSelect } from "@/modules/lookups/components/area-unit-select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { planSummary, quote, rateSize, rateText } from "../pricing"
import { ScheduleDocument } from "./price-list-document"
import { PLAN_PARTS } from "./price-list-parts"

const today = () => new Date().toISOString().slice(0, 10)
const UNSOLD = ["available", "on-hold", "blocked"]

// The query string a printed schedule is built from (no personal details)
export function scheduleQuery(input) {
  const q = new URLSearchParams()
  if (input.unitCode) q.set("unit", urlCode(input.unitCode))
  else {
    q.set("type", input.type)
    q.set("category", input.category)
    q.set("size", `${input.sizeValue}-${input.sizeUnit}`)
  }
  if (input.features.length) q.set("features", input.features.join(","))
  if (input.floor > 0) q.set("floor", String(input.floor))
  q.set("plan", input.planKey)
  q.set("start", input.start)
  return q.toString()
}

// What a buyer pays for a unit size (or a particular unit) under this list, and when
export function PriceCalculator({ list, units, marlaSqft, brand, printable }) {
  const types = useList("unit-type")
  const m = useMeasures()
  const featureList = useList("feature")
  const unsold = units.filter((u) => UNSOLD.includes(u.status))
  const [mode, setMode] = useState("size")
  const [rateKey, setRateKey] = useState(list.rates.find((r) => r.rate > 0)?.key ?? "")
  const [size, setSize] = useState({ value: 5, unit: "marla" }) // for any-size rates
  const [unitCode, setUnitCode] = useState(unsold[0]?.code ?? null)
  const [features, setFeatures] = useState([])
  const [floor, setFloor] = useState(null)
  const [planKey, setPlanKey] = useState(list.plans.find((p) => p.installments > 0)?.key ?? list.plans[0]?.key ?? "")
  const [start, setStart] = useState(today)
  const [preview, setPreview] = useState(false)

  if (!list.rates.some((r) => r.rate > 0) || !list.plans.length) return <p className="text-sm text-muted-foreground">Add at least one rate and one payment plan to use the calculator.</p>

  const rate = list.rates.find((r) => r.key === rateKey)
  const picked = mode === "unit" ? unsold.find((u) => u.code === unitCode) : null
  const unit = picked
    ? { type: picked.type, category: picked.category, sizeValue: picked.sizeValue, sizeUnit: picked.sizeUnit, features, floor: picked.floor }
    : rate
      ? {
          type: rate.type,
          category: rate.category,
          sizeValue: rate.sizeValue ?? size.value,
          sizeUnit: rate.sizeUnit ?? (m.unitsFor(rate.type).includes(size.unit) ? size.unit : m.unitsFor(rate.type)[0]),
          features,
          floor,
        }
      : null
  const featurePremium = (f) => Number(featureList.map[f]?.meta?.premium ?? 0)
  const q = unit && unit.sizeValue > 0 ? quote(list, unit, planKey, start || today(), { marlaSqft, featurePremium, m }) : null
  const premiumOptions = [...new Set([...list.premiums.map((p) => p.feature), ...featureList.options.filter((o) => featurePremium(o.value) > 0).map((o) => o.value)])]
  const pctOf = (f) => list.premiums.find((p) => p.feature === f)?.percent ?? featurePremium(f)
  const sqftType = unit && m.sizedInSqft(unit.type)

  const pickUnit = (code) => {
    setUnitCode(code)
    const u = unsold.find((x) => x.code === code)
    if (u) setFeatures(u.features)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <SectionCard title="Unit & plan" bodyClassName="space-y-4">
        {unsold.length > 0 && (
          <ToggleGroup
            value={mode}
            onChange={(m) => {
              setMode(m)
              if (m === "unit") pickUnit(unitCode)
              else setFeatures([])
            }}
            options={[
              { value: "size", label: "By size", icon: "ruler-line" },
              { value: "unit", label: "A unit", icon: "layout-grid-line" },
            ]}
          />
        )}
        {mode === "size" ? (
          <>
            <Select
              label="Unit size"
              value={rateKey}
              onChange={setRateKey}
              options={list.rates.filter((r) => r.rate > 0).map((r) => ({ value: r.key, label: `${types.label(r.type)} · ${rateSize(r, m)} · ${rateText(r, m)}` }))}
            />
            {rate?.sizeValue == null && rate && (
              <div className="flex gap-2">
                <NumberInput label="Size" className="flex-1" min={0} value={size.value} onChange={(v) => setSize((s) => ({ ...s, value: v }))} />
                <AreaUnitSelect label="Unit" units={m.unitsFor(rate.type)} value={size.unit} onChange={(u) => setSize((s) => ({ ...s, unit: u }))} />
              </div>
            )}
          </>
        ) : (
          <Combobox
            label="Unit"
            placeholder="Search by number…"
            value={unitCode}
            onChange={pickUnit}
            options={unsold.map((u) => ({ value: u.code, label: `${types.label(u.type)} ${u.number ?? u.code}`, description: `${m.formatSize(u.sizeValue, u.sizeUnit)} · ${formatPkr(u.price)} now` }))}
          />
        )}
        {unit?.type !== "file" && premiumOptions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-base text-muted-foreground">Premium location</p>
            <div className="flex flex-wrap gap-1.5">
              {premiumOptions.map((f) => {
                const on = features.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFeatures((l) => (on ? l.filter((x) => x !== f) : [...l, f]))}
                    className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
                  >
                    {featureList.label(f)} +{pctOf(f)}%
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {mode === "size" && sqftType && list.floorRisePct > 0 && <NumberInput label="Floor" min={0} max={200} step={1} value={floor} onChange={setFloor} placeholder="0 = ground" />}
        <Select label="Payment plan" value={planKey} onChange={setPlanKey} options={list.plans.map((p) => ({ value: p.key, label: p.name }))} />
        <DatePicker label="Booking date" clearable={false} value={start} onChange={(v) => setStart(v || today())} />
      </SectionCard>

      {q ? (
        <div className="min-w-0 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-4 shadow-xs">
              <p className="text-xs text-muted-foreground">Unit price</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatPkr(q.price)}</p>
              <p className="text-xs text-muted-foreground">
                Base {formatPkr(q.basePrice)}
                {q.floorRise ? ` incl. ${q.floorRise}% floor rise` : ""}
                {q.premiums.length ? ` + ${q.premiums.reduce((s, p) => s + p.percent, 0)}% premium` : ""}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4 shadow-xs">
              <p className="text-xs text-muted-foreground">{q.schedule.discount ? "Payable after discount" : "Down payment"}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatPkr(q.schedule.discount ? q.schedule.net : q.schedule.rows[0].amount)}</p>
              <p className="text-xs text-muted-foreground">{planSummary(q.plan)}</p>
            </div>
            <div className="rounded-xl border bg-background p-4 shadow-xs">
              <p className="text-xs text-muted-foreground">Other charges</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatPkr(q.chargesTotal)}</p>
              <p className="truncate text-xs text-muted-foreground">{q.charges.map((c) => c.name).join(", ") || "None"}</p>
            </div>
          </div>

          <SectionCard
            title={`Payment schedule · ${q.schedule.rows.length} ${q.schedule.rows.length === 1 ? "payment" : "payments"}`}
            bodyClassName="p-0"
            action={
              printable && (
                <Button size="sm" variant="outline" leftIcon="printer-line" onClick={() => setPreview(true)}>
                  Print
                </Button>
              )
            }
          >
            <ScrollView className="max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">#</th>
                    <th className="px-4 py-2 text-left font-medium">Due date</th>
                    <th className="px-4 py-2 text-left font-medium">Payment</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-right font-medium">Balance after</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {q.schedule.rows.map((r) => (
                    <tr key={r.key} className={cn(r.kind !== "installment" && "bg-muted/30")}>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{r.no}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className={cn("size-2 rounded-full", PLAN_PARTS[r.kind])} />
                          {r.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatAmount(r.amount)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{formatAmount(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollView>
          </SectionCard>

          {q.charges.length > 0 && (
            <SectionCard title="Charges payable separately" bodyClassName="p-0">
              <ul className="divide-y text-sm">
                {q.charges.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span>
                      {c.name}
                      <span className="block text-xs text-muted-foreground">{c.due}</span>
                    </span>
                    <span className="font-medium tabular-nums">{formatAmount(c.total)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{mode === "unit" && !picked ? "Pick a unit." : "No rate in this list covers that unit."}</p>
      )}
      {preview && q && (
        <PrintPreviewDialog
          title="Payment schedule"
          description={`${q.plan.name} · print preview (A4)`}
          printUrl={`/project-portfolio/price-lists/${urlCode(list.code)}/schedule?${scheduleQuery({ ...unit, unitCode: picked?.code, planKey: q.plan.key, start: start || today() })}`}
          pdfUrl={`/api/portfolio/price-lists/${urlCode(list.code)}/schedule?${scheduleQuery({ ...unit, unitCode: picked?.code, planKey: q.plan.key, start: start || today() })}`}
          onClose={() => setPreview(false)}
        >
          <ScheduleDocument list={{ ...list, project: { ...list.project, marlaSqft } }} unit={picked} input={unit} planKey={q.plan.key} start={start || today()} brand={brand} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}
