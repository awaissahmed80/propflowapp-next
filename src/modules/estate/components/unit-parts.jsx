"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatPkr } from "@/lib/format"
import { toHex } from "@/lib/color"
import { useList, useMeasures } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Notice } from "@/modules/users/components/user-parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { AreaUnitSelect } from "@/modules/lookups/components/area-unit-select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { formatSize, priceFor, sizeInMarla } from "../constants"
import { blockUnits, holdUnits, repriceUnits, updateUnit } from "../server/inventory"

// Small pieces shared by the inventory table, board and unit panel

export function UnitStatusBadge({ status }) {
  const s = useList("unit-status").map[status]
  return (
    <Badge color={toHex(s?.color) ?? "gray"} dot>
      {s?.label ?? status}
    </Badge>
  )
}

// "Plot 12", "File SKE-F-1001"
export function useUnitLabel() {
  const types = useList("unit-type")
  return (u) => `${types.label(u.type)} ${u.number}`
}

// "Block A · Street 2 · Floor 4"
export const unitPlace = (u) => [u.block?.name, u.street, u.floor != null && u.floor > 0 && u.type !== "shop" ? `Floor ${u.floor}` : null].filter(Boolean).join(" · ")

// "5 Marla · 25×45 ft", "650 sq ft · 2 bed"
export const unitSize = (u) => [formatSize(u.sizeValue, u.sizeUnit), u.dimensions ? `${u.dimensions} ft` : null, u.bedrooms ? `${u.bedrooms} bed` : null].filter(Boolean).join(" · ")

// "Rs 2.7 Lac/marla" or "Rs 15,000/sq ft": the unit's own rate
export const ratePer = (u) => `${formatPkr(unitRate(u))}/${sizeInMarla(u.sizeValue, u.sizeUnit) ? "marla" : "sq ft"}`

// Hold countdown: "2d 5h left", "Under 1h left", "Expired 3h ago"; soon = 6 hours or less
export function holdLeft(expiresAt, now = Date.now()) {
  const ms = new Date(expiresAt).getTime() - now
  if (ms <= 0) return { text: `Expired ${Math.max(1, Math.round(-ms / 3_600_000))}h ago`, soon: true, expired: true }
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return { text: "Under 1h left", soon: true }
  if (h < 24) return { text: `${h}h left`, soon: h <= 6 }
  return { text: `${Math.floor(h / 24)}d ${h % 24}h left`, soon: false }
}

function useRun() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const run = (fn, onDone) =>
    startTransition(async () => {
      setError("")
      const result = await fn()
      if (result?.error) setError(result.error)
      else {
        onDone?.(result)
        router.refresh()
      }
    })
  return { run, pending, error }
}

// Put units on hold (or extend): 24 / 48 / 72 hours with a reason
export function HoldDialog({ codes, title, extending = false, currentReason, onClose, onDone }) {
  const reasons = useList("hold-reason")
  const { run, pending, error } = useRun()
  const [hours, setHours] = useState("48")
  const [reason, setReason] = useState(currentReason ?? reasons.defaultValue ?? reasons.options[0]?.value ?? "")
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title ?? (extending ? "Extend hold" : "Put on hold")}
      description="Held units are kept aside for a while. Holds end on their own when time runs out."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon="lock-line"
            loading={pending}
            onClick={() =>
              run(
                () => holdUnits(codes, { hours: Number(hours), reason }),
                (r) => (onDone?.(r), onClose()),
              )
            }
          >
            {extending ? "Extend hold" : "Hold"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-1">
        <p className="text-base text-muted-foreground">Hold for</p>
        <ToggleGroup
          value={hours}
          onChange={setHours}
          options={[
            { value: "24", label: "24 hours" },
            { value: "48", label: "48 hours" },
            { value: "72", label: "72 hours" },
          ]}
        />
      </div>
      <LookupSelect list="hold-reason" label="Reason" value={reason} onChange={setReason} />
    </Dialog>
  )
}

// Take units off sale with a reason
export function BlockDialog({ codes, title, onClose, onDone }) {
  const { run, pending, error } = useRun()
  const [reason, setReason] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title ?? "Block"}
      description="Blocked units are taken off sale for everyone, including dealers, until unblocked."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            leftIcon="forbid-line"
            loading={pending}
            onClick={() =>
              run(
                () => blockUnits(codes, reason),
                (r) => (onDone?.(r), onClose()),
              )
            }
          >
            Block
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Textarea label="Reason" required autoFocus rows={3} placeholder="e.g. Litigation, management reserve" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Dialog>
  )
}

// New price for unsold units: by a percentage, or a new base rate (when all are marla, or all sq ft)
export function RepriceDialog({ units, onClose, onDone }) {
  const { run, pending, error } = useRun()
  const unsold = units.filter((u) => ["available", "on-hold", "blocked"].includes(u.status))
  const kinds = new Set(unsold.map((u) => (sizeInMarla(u.sizeValue, u.sizeUnit) ? "marla" : "sqft")))
  const rateUnit = kinds.size === 1 ? [...kinds][0] : null
  const [mode, setMode] = useState("percent")
  const [value, setValue] = useState(5)
  const before = unsold.reduce((s, u) => s + u.price, 0)
  const preview = unsold.reduce((s, u) => {
    const marla = sizeInMarla(u.sizeValue, u.sizeUnit)
    const base = mode === "rate" ? (marla ?? u.areaSqft) * (value || 0) : u.basePrice * (1 + (value || 0) / 100)
    const pct = (u.premiums ?? []).reduce((t, p) => t + Number(p.percent || 0), 0)
    return s + base * (1 + pct / 100)
  }, 0)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Revise price"
      description={`${unsold.length} unsold ${unsold.length === 1 ? "unit" : "units"}. Booked and sold units keep their price. Premiums are re-applied.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftIcon="price-tag-3-line"
            loading={pending}
            disabled={!unsold.length}
            onClick={() =>
              run(
                () =>
                  repriceUnits(
                    unsold.map((u) => u.code),
                    { mode, value },
                  ),
                (r) => (onDone?.(r), onClose()),
              )
            }
          >
            Update prices
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <ToggleGroup
        value={mode}
        onChange={(m) => {
          setMode(m)
          setValue(m === "percent" ? 5 : null)
        }}
        options={[{ value: "percent", label: "By percentage" }, ...(rateUnit ? [{ value: "rate", label: `New rate per ${rateUnit === "marla" ? "marla" : "sq ft"}` }] : [])]}
      />
      {!rateUnit && unsold.length > 0 && <p className="text-xs text-muted-foreground">The selection mixes marla and sq ft units, so only a percentage applies.</p>}
      {mode === "percent" ? (
        <NumberInput label="Change" suffix="%" step={1} value={value} onChange={setValue} info="Use a minus sign to lower prices" />
      ) : (
        <NumberInput label={`Base rate per ${rateUnit === "marla" ? "marla" : "sq ft"}`} prefix="Rs" min={0} step={rateUnit === "marla" ? 50000 : 500} value={value} onChange={setValue} />
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Now</p>
          <p className="font-semibold tabular-nums">{formatPkr(before)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">After</p>
          <p className="font-semibold tabular-nums">{formatPkr(Math.round(preview / 1000) * 1000)}</p>
        </div>
      </div>
    </Dialog>
  )
}

// The unit's own rate per marla (or sq ft); older units derive it from their base price
export const unitRate = (u) => u.baseRate || u.basePrice / (sizeInMarla(u.sizeValue, u.sizeUnit) ?? (u.areaSqft || 1))

// Change one unsold unit's size, premium features and place; the price follows its own rate
export function EditUnitDialog({ unit: u, priceList, title, onClose }) {
  const featureList = useList("feature")
  const { run, pending, error } = useRun()
  const m = useMeasures()
  const sqft = m.sizedInSqft(u.type)
  const isFile = u.type === "file"
  const [form, setForm] = useState({ sizeValue: u.sizeValue, sizeUnit: u.sizeUnit, features: u.features ?? [], street: u.street ?? "", floor: u.floor, bedrooms: u.bedrooms })
  const [fieldErrors, setFieldErrors] = useState({})
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const rate = unitRate(u)
  // Premiums at the active price list's %, else the feature's default (as the server recalculates)
  const premiumOf = (f) => Number(priceList?.premiums.find((p) => p.feature === f)?.percent ?? featureList.map[f]?.meta?.premium ?? 0)
  const premiums = form.features.map((f) => ({ feature: f, percent: premiumOf(f) }))
  const { base, price } = form.sizeValue > 0 ? priceFor({ rate, value: form.sizeValue, unit: form.sizeUnit, marlaSqft: u.project?.marlaSqft ?? 225, premiums, m }) : { base: 0, price: 0 }
  const now = isFile ? base : price
  const options = [...featureList.options, ...form.features.filter((f) => !featureList.map[f]).map((f) => ({ value: f, label: f }))]
  const save = () =>
    run(
      async () => {
        setFieldErrors({})
        const r = await updateUnit(u.code, form)
        if (r?.fieldErrors) setFieldErrors(r.fieldErrors)
        return r?.fieldErrors ? { error: "Check the highlighted fields." } : r
      },
      () => onClose(),
    )
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title ?? "Edit unit"}
      description={`Priced at ${formatPkr(rate)} per ${sqft ? "sq ft" : "marla"}. Change the size or premium features to get this unit's price.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="save-line" loading={pending} disabled={!(form.sizeValue > 0)} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <NumberInput label="Size" className="flex-1" min={0} required value={form.sizeValue} onChange={set("sizeValue")} error={fieldErrors.sizeValue} />
        <AreaUnitSelect label="Unit" units={m.unitsFor(u.type)} value={form.sizeUnit} onChange={set("sizeUnit")} />
      </div>
      {!isFile && options.length > 0 && (
        <div className="space-y-1">
          <p className="text-base text-muted-foreground">Premium features</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
              const on = form.features.includes(o.value)
              const pct = premiumOf(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("features")(on ? form.features.filter((x) => x !== o.value) : [...form.features, o.value])}
                  className={cn("cursor-pointer rounded-full border px-2.5 py-1 text-sm", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  {o.label} +{pct}%
                </button>
              )
            })}
          </div>
        </div>
      )}
      {["plot", "house", "farmhouse"].includes(u.type) && <Input label="Street" value={form.street} onChange={(e) => set("street")(e.target.value)} error={fieldErrors.street} />}
      {(sqft || ["house", "apartment"].includes(u.type)) && (
        <div className="flex gap-2">
          {sqft && <NumberInput label="Floor" className="flex-1" step={1} value={form.floor} onChange={set("floor")} error={fieldErrors.floor} />}
          {["house", "apartment"].includes(u.type) && <NumberInput label="Bedrooms" className="flex-1" min={0} step={1} value={form.bedrooms} onChange={set("bedrooms")} error={fieldErrors.bedrooms} />}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Now</p>
          <p className="font-semibold tabular-nums">{formatPkr(u.price)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">After</p>
          <p className={cn("font-semibold tabular-nums", now !== u.price && "text-primary")}>{now ? formatPkr(now) : "—"}</p>
        </div>
      </div>
    </Dialog>
  )
}
