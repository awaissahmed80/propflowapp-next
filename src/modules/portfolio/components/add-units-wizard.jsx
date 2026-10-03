"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { useList, useMeasures } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { AreaUnitSelect } from "@/modules/lookups/components/area-unit-select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { priceFor, standardDimensions } from "../constants"
import { rateFor } from "../pricing"
import { addUnits } from "../server/inventory"

// Add inventory in three steps: where (project, phase, block) → which units (type, numbers,
// size, features) → price and status. A preview alongside shows what will be added.

const STEPS = ["Where", "Units", "Price & status"]
const PRESETS = [
  [3, "marla"],
  [5, "marla"],
  [7, "marla"],
  [10, "marla"],
  [1, "kanal"],
  [2, "kanal"],
]

function Stepper({ step }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-col gap-1.5">
          <span className={cn("h-1 rounded-full", i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted")} />
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/15 text-primary" : "bg-muted")}>
              {i < step ? <Icon name="check-line" /> : i + 1}
            </span>
            {s}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function AddUnitsWizard({ tree, initialProject, initialBlock, onClose, onAdded }) {
  const router = useRouter()
  const types = useList("unit-type")
  const featureList = useList("feature")
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  // Start from the project / block in the URL, if any
  const start = useMemo(() => {
    const p = tree.find((x) => x.code.toLowerCase() === (initialProject ?? "").toLowerCase()) ?? tree[0]
    const ph = p?.phases.find((x) => x.blocks.some((b) => b.name === initialBlock)) ?? p?.phases[0]
    const b = ph?.blocks.find((x) => x.name === initialBlock) ?? ph?.blocks[0]
    return { project: p?.code ?? "", phaseId: ph ? String(ph.id) : "", blockId: b ? String(b.id) : "" }
  }, [tree, initialProject, initialBlock])

  const [form, setForm] = useState(() => ({
    project: start.project,
    phaseId: start.phaseId,
    blockId: start.blockId,
    type: "",
    numbering: "series",
    prefix: "",
    from: 1,
    to: 20,
    number: "",
    sizeValue: 5,
    sizeUnit: "marla",
    street: "",
    floor: null,
    bedrooms: null,
    features: [],
    rate: null,
    status: "available",
    sizing: "same", // "same" | "mixed" (series only)
    overrides: {}, // number → { sizeValue, sizeUnit, features } when sizes are mixed
  }))
  const [picked, setPicked] = useState(() => new Set()) // rows ticked in the mixed table
  const [bulkSize, setBulkSize] = useState({ value: null, unit: "marla" })
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const project = tree.find((p) => p.code === form.project)
  const phase = project?.phases.find((p) => String(p.id) === form.phaseId)
  const block = phase?.blocks.find((b) => String(b.id) === form.blockId)
  const unballoted = phase?.stage === "unballoted"
  const m = useMeasures()
  const allowedTypes = block || unballoted ? m.typesFor(block?.category, { unballoted }) : []
  const typeOptions = types.options.filter((o) => allowedTypes.includes(o.value))
  const type = allowedTypes.includes(form.type) ? form.type : typeOptions[0]?.value
  const sqft = m.sizedInSqft(type)
  const isFile = type === "file"

  // Picking where: keep phase/block valid, and set file numbering for unballoted phases
  const pickProject = (code) => {
    const p = tree.find((x) => x.code === code)
    const ph = p?.phases[0]
    pickPhase(ph, code)
  }
  const pickPhase = (ph, code = form.project) => {
    const p = tree.find((x) => x.code === code)
    setForm((f) => ({
      ...f,
      project: code,
      phaseId: ph ? String(ph.id) : "",
      blockId: ph?.blocks[0] ? String(ph.blocks[0].id) : "",
      ...(ph?.stage === "unballoted" ? { prefix: `${p?.code ?? ""}-F-`, from: 1001, to: 1050, numbering: "series" } : f.prefix.endsWith("-F-") ? { prefix: "", from: 1, to: 20 } : {}),
    }))
  }

  const numbers =
    form.numbering === "single"
      ? form.number
        ? [form.number]
        : []
      : Number.isInteger(form.from) && Number.isInteger(form.to) && form.to >= form.from
        ? Array.from({ length: Math.min(form.to - form.from + 1, 1000) }, (_, i) => `${form.prefix}${form.from + i}`)
        : []
  const sizeValue = form.sizeValue
  // Units this type is sized in (Lists & Labels › Area units)
  const allowedUnits = m.unitsFor(type)
  const fitUnit = (u) => (allowedUnits.includes(u) ? u : allowedUnits[0])
  const sizeUnit = fitUnit(form.sizeUnit)
  // The project's active price list: its premium % and, until a rate is typed, its rate for this size
  const priceList = project?.priceList ?? null
  const premiumOf = (f) => Number(priceList?.premiums.find((p) => p.feature === f)?.percent ?? featureList.map[f]?.meta?.premium ?? 0)
  const listRate = priceList && type && block && sizeValue ? (rateFor(priceList.rates, { type, category: block.category, sizeValue, sizeUnit })?.rate ?? null) : null
  const rate = form.rate ?? listRate
  const premiums = isFile ? [] : form.features.map((f) => ({ feature: f, percent: premiumOf(f) }))
  const { base, price } = rate && sizeValue ? priceFor({ rate, value: sizeValue, unit: sizeUnit, marlaSqft: project?.marlaSqft ?? 225, premiums, m }) : { base: 0, price: 0 }
  const dims = !sqft && !isFile && sizeValue ? standardDimensions(project?.marlaSqft ?? 225, m.sizeInMarla(sizeValue, sizeUnit), "marla") : null

  // One row per unit: the series' size and features, or each unit's own when sizes are mixed
  const mixed = form.sizing === "mixed" && form.numbering === "series"
  const rows = numbers.map((n) => {
    const o = mixed ? form.overrides[n] : null
    const r = { number: n, sizeValue: o?.sizeValue ?? sizeValue, sizeUnit: fitUnit(o?.sizeUnit ?? sizeUnit), features: isFile ? [] : (o?.features ?? form.features) }
    const prem = r.features.map((f) => ({ feature: f, percent: premiumOf(f) }))
    const p = rate && r.sizeValue ? priceFor({ rate, value: r.sizeValue, unit: r.sizeUnit, marlaSqft: project?.marlaSqft ?? 225, premiums: prem, m }) : { base: 0, price: 0 }
    return { ...r, price: isFile ? p.base : p.price }
  })
  const totalValue = rows.reduce((t, r) => t + r.price, 0)
  const mix = Object.entries(rows.reduce((acc, r) => ((acc[m.formatSize(r.sizeValue || 0, r.sizeUnit)] = (acc[m.formatSize(r.sizeValue || 0, r.sizeUnit)] ?? 0) + 1), acc), {}))
  const override = (numbersToChange, patch) =>
    setForm((f) => {
      const next = { ...f.overrides }
      for (const n of numbersToChange) {
        const cur = rows.find((r) => r.number === n)
        next[n] = { sizeValue: cur.sizeValue, sizeUnit: cur.sizeUnit, features: cur.features, ...next[n], ...patch(cur) }
      }
      return { ...f, overrides: next }
    })

  const check = (s) => {
    const e = {}
    if (s === 0) {
      if (!project) e.project = "Pick a project."
      if (!phase) e.phaseId = "Pick a phase."
      if (!block) e.blockId = "Pick a block."
    }
    if (s === 1) {
      if (!type) e.type = "This block can't hold any unit type."
      if (form.numbering === "single" && !form.number.trim()) e.number = "Enter the unit number."
      if (form.numbering === "series") {
        if (!Number.isInteger(form.from) || !Number.isInteger(form.to) || form.to < form.from) e.from = "Enter a valid From and To range."
        else if (form.to - form.from + 1 > 500) e.to = "Add at most 500 units at a time."
      }
      if (!(sizeValue > 0)) e.sizeValue = "Enter the unit size."
    }
    if (s === 2 && !(rate > 0)) e.rate = `Enter the base rate per ${sqft ? "sq ft" : "marla"}.`
    if (s === 2 && mixed && rows.some((r) => !(r.sizeValue > 0))) e.rows = "Every unit needs a size."
    setErrors(e)
    return !Object.keys(e).length
  }

  const submit = () => {
    if (!check(2)) return
    startTransition(async () => {
      setError("")
      const result = await addUnits({
        ...form,
        rate,
        projectCode: form.project,
        type,
        sizeUnit,
        features: isFile ? [] : form.features,
        sizing: mixed ? "mixed" : "same",
        rows: mixed ? rows.map(({ number, sizeValue, sizeUnit, features }) => ({ number, sizeValue, sizeUnit, features })) : undefined,
      })
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        const k = Object.keys(result.fieldErrors)[0]
        setStep(["phaseId", "blockId", "project"].includes(k) ? 0 : ["rate", "rows"].includes(k) ? 2 : 1)
      } else if (result.error) setError(result.error)
      else {
        onAdded?.(`${result.added} ${result.added === 1 ? "unit" : "units"} added to ${result.blockName}.`)
        onClose()
        router.refresh()
      }
    })
  }

  const preview = (
    <aside className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Preview</p>
      <p className="font-medium">
        {numbers.length} {types.map[type]?.meta?.plural?.toLowerCase() && numbers.length !== 1 ? types.map[type].meta.plural.toLowerCase() : types.label(type ?? "").toLowerCase()} in {block?.name ?? "—"}
        <span className="block text-xs font-normal text-muted-foreground">
          {project?.name} · {phase?.name}
        </span>
      </p>
      {numbers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {numbers.slice(0, 24).map((n) => (
            <span key={n} className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px]">
              {n}
            </span>
          ))}
          {numbers.length > 24 && <span className="text-xs text-muted-foreground">+{numbers.length - 24} more</span>}
        </div>
      )}
      <dl className="divide-y border-t">
        <div className="flex justify-between py-1.5">
          <dt className="text-muted-foreground">Size</dt>
          <dd>{mixed ? "Mixed" : sizeValue ? `${m.formatSize(sizeValue, sizeUnit)}${dims ? ` · ${dims} ft` : ""}` : "—"}</dd>
        </div>
        <div className="flex justify-between py-1.5">
          <dt className="text-muted-foreground">Base price</dt>
          <dd className="tabular-nums">{base ? formatPkr(base) : "—"}</dd>
        </div>
        {premiums.length > 0 && (
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Premiums</dt>
            <dd>+{premiums.reduce((s, p) => s + p.percent, 0)}%</dd>
          </div>
        )}
        {mixed ? (
          <div className="py-1.5">
            <dt className="text-muted-foreground">Mix</dt>
            <dd className="mt-0.5 text-xs">{mix.map(([k, n]) => `${n} × ${k}`).join(", ")}</dd>
          </div>
        ) : (
          <div className="flex justify-between py-1.5 font-medium">
            <dt>Price per unit</dt>
            <dd className="tabular-nums">{price ? formatPkr(isFile ? base : price) : "—"}</dd>
          </div>
        )}
        <div className="flex justify-between py-1.5 font-semibold">
          <dt>Stock value</dt>
          <dd className="tabular-nums">{totalValue ? formatPkr(totalValue) : "—"}</dd>
        </div>
      </dl>
    </aside>
  )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(56rem,calc(100%-4rem))]"
      scrollable
      bodyClassName="space-y-5"
      title="Add inventory"
      description={`Step ${step + 1} of ${STEPS.length}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="outline" leftIcon="arrow-left-line" className="mr-auto" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <Button variant="outline" className="mr-auto" onClick={onClose}>
              Cancel
            </Button>
          )}
          {step < 2 ? (
            <Button rightIcon="arrow-right-line" onClick={() => check(step) && setStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button leftIcon="add-line" loading={pending} onClick={submit}>
              Add {numbers.length} {numbers.length === 1 ? "unit" : "units"}
            </Button>
          )}
        </>
      }
    >
      <Stepper step={step} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className={cn("grid gap-5", step > 0 && "lg:grid-cols-[minmax(0,1fr)_17rem]")}>
        <div className="min-w-0 space-y-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Project" value={form.project} onChange={pickProject} options={tree.map((p) => ({ value: p.code, label: p.name }))} error={errors.project} />
              <Select
                label="Phase"
                value={form.phaseId}
                onChange={(v) => pickPhase(project?.phases.find((p) => String(p.id) === v))}
                options={(project?.phases ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
                error={errors.phaseId}
              />
              <Select
                label={unballoted ? "File pool" : "Block"}
                value={form.blockId}
                onChange={set("blockId")}
                options={(phase?.blocks ?? []).map((b) => ({ value: String(b.id), label: `${b.name} · ${b.category}` }))}
                error={errors.blockId}
              />
              {unballoted && <p className="text-sm text-muted-foreground sm:col-span-3">This phase is unballoted: you&apos;re adding open files, numbered {form.prefix}1001 and up. Plot numbers come at balloting.</p>}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <p className="text-base text-muted-foreground">Unit type</p>
                <div className="flex flex-wrap gap-2">
                  {typeOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={type === o.value}
                      onClick={() => set("type")(o.value)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        type === o.value ? "border-primary bg-primary/5 font-medium ring-1 ring-primary" : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      <Icon name={types.map[o.value]?.icon ?? "layout-grid-line"} className="text-base" />
                      {o.label}
                    </button>
                  ))}
                </div>
                {errors.type && <p className="text-[13px] text-destructive">{errors.type}</p>}
              </div>

              <div className="space-y-2">
                <ToggleGroup
                  value={form.numbering}
                  onChange={set("numbering")}
                  options={[
                    { value: "series", label: "Numbered series", icon: "list-ordered" },
                    { value: "single", label: "One unit", icon: "checkbox-blank-line" },
                  ]}
                />
                {form.numbering === "series" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="Prefix" placeholder="e.g. A-" value={form.prefix} onChange={(e) => set("prefix")(e.target.value)} />
                    <NumberInput label="From" min={0} value={form.from} onChange={set("from")} error={errors.from} />
                    <NumberInput label="To" min={0} value={form.to} onChange={set("to")} error={errors.to} />
                  </div>
                ) : (
                  <Input
                    label="Unit number"
                    placeholder={isFile ? `${project?.code}-F-1001` : sqft ? "e.g. 101 or C-1" : "e.g. 12"}
                    value={form.number}
                    onChange={(e) => set("number")(e.target.value)}
                    error={errors.number}
                  />
                )}
              </div>

              {form.numbering === "series" && (
                <div className="space-y-1">
                  <ToggleGroup
                    value={form.sizing}
                    onChange={set("sizing")}
                    options={[
                      { value: "same", label: "Same size for all", icon: "equal-line" },
                      { value: "mixed", label: "Mixed sizes", icon: "layout-masonry-line" },
                    ]}
                  />
                  {form.sizing === "mixed" && <p className="text-xs text-muted-foreground">Set the usual size and features here; you&apos;ll adjust each unit in the next step, where its price shows.</p>}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-base text-muted-foreground">{mixed ? "Usual size" : "Size"}</p>
                {!sqft && (
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map(([v, unit]) => (
                      <button
                        key={`${v}${unit}`}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, sizeValue: v, sizeUnit: unit }))}
                        className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-xs", sizeValue === v && sizeUnit === unit ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}
                      >
                        {m.formatSize(v, unit)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
                  <NumberInput aria-label="Size" min={0} step={sqft ? 50 : 1} value={sizeValue} onChange={set("sizeValue")} error={errors.sizeValue} />
                  <AreaUnitSelect aria-label="Unit" units={allowedUnits} triggerClassName="w-full" value={sizeUnit} onChange={set("sizeUnit")} />
                </div>
                {dims && <p className="text-xs text-muted-foreground">Standard dimensions {dims} ft</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {["plot", "house", "farmhouse"].includes(type) && <Input label="Street" placeholder="Street 2" value={form.street} onChange={(e) => set("street")(e.target.value)} />}
                {sqft && <NumberInput label="Floor" min={-5} max={200} value={form.floor} onChange={set("floor")} info="0 = ground" />}
                {["house", "apartment"].includes(type) && <NumberInput label="Bedrooms" min={0} max={20} value={form.bedrooms} onChange={set("bedrooms")} />}
              </div>

              {!isFile && featureList.options.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-base text-muted-foreground">{mixed ? "Usual premium features" : "Premium features"}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {featureList.options.map((o) => (
                      <Checkbox
                        key={o.value}
                        label={`${o.label} +${premiumOf(o.value)}%`}
                        checked={form.features.includes(o.value)}
                        onChange={(on) => set("features")(on ? [...form.features, o.value] : form.features.filter((x) => x !== o.value))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {mixed && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2">
                    <span className="mr-auto text-xs text-muted-foreground">{picked.size ? `${picked.size} selected` : "Tick units to change several at once"}</span>
                    <NumberInput aria-label="Size for selected" size="sm" className="w-24" min={0} value={bulkSize.value} onChange={(v) => setBulkSize((b) => ({ ...b, value: v }))} />
                    <AreaUnitSelect aria-label="Unit for selected" size="sm" triggerClassName="w-24" units={allowedUnits} value={bulkSize.unit} onChange={(u) => setBulkSize((b) => ({ ...b, unit: u }))} />
                    <Button size="sm" variant="outline" disabled={!picked.size || !(bulkSize.value > 0)} onClick={() => override([...picked], () => ({ sizeValue: bulkSize.value, sizeUnit: fitUnit(bulkSize.unit) }))}>
                      Set size
                    </Button>
                    {!isFile && featureList.options.length > 0 && (
                      <DropdownMenu
                        align="end"
                        items={featureList.options.map((o) => ({
                          key: o.value,
                          label: `${o.label} +${premiumOf(o.value)}%`,
                          onClick: () => {
                            const all = [...picked].every((n) => rows.find((r) => r.number === n)?.features.includes(o.value))
                            override([...picked], (cur) => ({ features: all ? cur.features.filter((x) => x !== o.value) : [...new Set([...cur.features, o.value])] }))
                          },
                        }))}
                        trigger={
                          <Button size="sm" variant="outline" disabled={!picked.size} rightIcon="arrow-down-s-line">
                            Premium
                          </Button>
                        }
                      />
                    )}
                  </div>
                  <ScrollView className="max-h-72 rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th className="w-10 px-2 py-2">
                            <input
                              type="checkbox"
                              aria-label="Select all"
                              className="size-4 accent-primary"
                              checked={picked.size === rows.length && rows.length > 0}
                              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.number)) : new Set())}
                            />
                          </th>
                          <th className="px-2 py-2 text-left font-medium">Unit</th>
                          <th className="px-2 py-2 text-left font-medium">Size</th>
                          {!isFile && <th className="px-2 py-2 text-left font-medium">Premium</th>}
                          <th className="px-3 py-2 text-right font-medium">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((r) => (
                          <tr key={r.number} className={cn(picked.has(r.number) && "bg-primary/5")}>
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Select ${r.number}`}
                                className="size-4 accent-primary"
                                checked={picked.has(r.number)}
                                onChange={() =>
                                  setPicked((p) => {
                                    const n = new Set(p)
                                    if (n.has(r.number)) n.delete(r.number)
                                    else n.add(r.number)
                                    return n
                                  })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs">{r.number}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <NumberInput aria-label={`Size of ${r.number}`} size="sm" className="w-20" min={0} value={r.sizeValue} onChange={(v) => override([r.number], () => ({ sizeValue: v }))} />
                                <AreaUnitSelect
                                  aria-label={`Unit of ${r.number}`}
                                  size="sm"
                                  triggerClassName="w-24"
                                  units={allowedUnits}
                                  value={r.sizeUnit}
                                  onChange={(u) => override([r.number], () => ({ sizeUnit: u }))}
                                />
                              </div>
                            </td>
                            {!isFile && (
                              <td className="px-2 py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {featureList.options.map((o) => {
                                    const on = r.features.includes(o.value)
                                    return (
                                      <button
                                        key={o.value}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => override([r.number], (cur) => ({ features: on ? cur.features.filter((x) => x !== o.value) : [...cur.features, o.value] }))}
                                        className={cn("cursor-pointer rounded-full border px-1.5 py-0.5 text-[11px]", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
                                      >
                                        {o.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.price ? formatPkr(r.price) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollView>
                  {errors.rows && <p className="text-[13px] text-destructive">{errors.rows}</p>}
                </div>
              )}
              <NumberInput label={`Base rate per ${sqft ? "sq ft" : "marla"}`} required prefix="Rs" min={0} step={sqft ? 500 : 50000} value={rate} onChange={set("rate")} error={errors.rate} />
              {listRate && (
                <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon name="price-tag-3-line" />
                  {form.rate == null || form.rate === listRate ? (
                    `From the active price list (v${priceList.version})`
                  ) : (
                    <>
                      Price list rate is Rs {new Intl.NumberFormat("en-PK").format(listRate)}.
                      <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => set("rate")(null)}>
                        Use it
                      </button>
                    </>
                  )}
                </p>
              )}
              <div className="space-y-1">
                <p className="text-base text-muted-foreground">Status</p>
                <ToggleGroup
                  value={form.status}
                  onChange={set("status")}
                  options={[
                    { value: "available", label: "Available for sale", icon: "checkbox-circle-line" },
                    { value: "blocked", label: "Blocked", icon: "forbid-line" },
                  ]}
                />
              </div>
            </>
          )}
        </div>
        {step > 0 && preview}
      </div>
    </Dialog>
  )
}
