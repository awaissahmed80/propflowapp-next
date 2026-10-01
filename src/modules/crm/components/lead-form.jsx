"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { formatPkPhone } from "@/lib/phone"
import { timeAgo } from "@/lib/format"
import { useList, useMeasures } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { AreaUnitSelect } from "@/modules/lookups/components/area-unit-select"
import { Notice } from "@/modules/users/components/user-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { PersonPicker } from "@/components/person-picker"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { PAYMENT_PLANS, PURPOSES } from "../constants"
import { createLead, findByPhone, updateLead } from "../server/leads"
import { LeadStatusBadge, TempPicker } from "./lead-parts"

const blank = (priority) => ({
  name: "",
  phone: "",
  whatsapp: true,
  email: "",
  city: "",
  overseas: false,
  source: "",
  priority,
  projectCode: "",
  unitType: "",
  sizeValue: null,
  sizeUnit: "marla",
  budgetMin: null,
  budgetMax: null,
  paymentPlan: null,
  purpose: null,
  notes: "",
  assignedTo: "",
})

const fromLead = (l) => ({
  name: l.name,
  phone: formatPkPhone(l.phone),
  whatsapp: l.whatsapp,
  email: l.email ?? "",
  city: l.city ?? "",
  overseas: l.overseas,
  source: l.source ?? "",
  priority: l.priority,
  projectCode: l.interest.project?.code ?? "",
  unitType: l.interest.unitType ?? "",
  sizeValue: l.interest.sizeValue,
  sizeUnit: l.interest.sizeUnit ?? "marla",
  budgetMin: l.interest.budgetMin,
  budgetMax: l.interest.budgetMax,
  paymentPlan: l.interest.paymentPlan,
  purpose: l.interest.purpose,
  notes: l.notes ?? "",
  assignedTo: "",
})

// Add a lead (or change one): the five things that matter up front, the rest under "More details".
// A lead already on the same mobile is shown before a second one is added.
export function LeadForm({ lead, agents, projects, access, me, onClose, onSaved, onOpenExisting }) {
  const priorities = useList("lead-priority")
  const sources = useList("lead-source")
  const editing = Boolean(lead)
  const [form, setForm] = useState(() => (lead ? fromLead(lead) : { ...blank(priorities.defaultValue ?? "moderate"), source: sources.defaultValue ?? "", assignedTo: String(me) }))
  const [more, setMore] = useState(editing)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [existing, setExisting] = useState([]) // leads already on this mobile
  const [duplicate, setDuplicate] = useState(false) // the server stopped a second open lead
  const [pending, startTransition] = useTransition()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  // Units that fit what they're looking for (any unit when the type isn't known)
  const m = useMeasures()
  const allowedUnits = form.unitType ? m.unitsFor(form.unitType) : m.allUnits

  const checkPhone = () => {
    if (editing || form.phone.replace(/\D/g, "").length < 10) return
    startTransition(async () => {
      const r = await findByPhone(form.phone)
      setExisting(r.leads ?? [])
    })
  }

  const submit = (force = false) =>
    startTransition(async () => {
      setErrors({})
      setError("")
      const data = { ...form, sizeUnit: allowedUnits.includes(form.sizeUnit) ? form.sizeUnit : allowedUnits[0], assignedTo: form.assignedTo || null }
      const r = editing ? await updateLead(lead.code, data) : await createLead(data, { force })
      if (r.fieldErrors) {
        setErrors(r.fieldErrors)
        if (Object.keys(r.fieldErrors).some((k) => !["name", "phone", "projectCode", "source", "assignedTo"].includes(k))) setMore(true)
      } else if (r.error) setError(r.error)
      else if (r.duplicate) {
        setExisting(r.duplicate)
        setDuplicate(true)
      } else onSaved(r.code ?? lead.code)
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={editing ? `Edit ${lead.name}` : "New lead"}
      description={editing ? "Contact details, what they're looking for and where they came from." : "Just the essentials. Add the rest now under More details, or later."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {duplicate ? (
            <Button variant="outline" leftIcon="add-line" loading={pending} onClick={() => submit(true)}>
              Add anyway
            </Button>
          ) : (
            <Button leftIcon={editing ? "save-line" : "add-line"} loading={pending} onClick={() => submit(false)}>
              {editing ? "Save" : "Add lead"}
            </Button>
          )}
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" required autoFocus value={form.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
        <Input
          label="Mobile"
          required
          inputMode="tel"
          placeholder="0300 1234567"
          value={form.phone}
          onChange={(e) => {
            set("phone")(e.target.value)
            setDuplicate(false)
          }}
          onBlur={checkPhone}
          error={errors.phone}
        />
      </div>

      {existing.length > 0 && (
        <div className={cn("rounded-lg border px-3 py-2.5 text-sm", duplicate ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/40")}>
          <p className="flex items-center gap-1.5 font-medium">
            <Icon name="user-search-line" /> {duplicate ? "They already have an open lead" : `Already enquired ${existing.length === 1 ? "once" : `${existing.length} times`}`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {existing.map((l, i) => (
              <li key={l.code ?? i} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{l.name}</span>
                <LeadStatusBadge status={l.status} />
                <span className="text-xs text-muted-foreground">
                  {[l.project, timeAgo(l.createdAt)].filter(Boolean).join(" · ")}
                </span>
                {l.code ? (
                  <button type="button" className="ml-auto cursor-pointer text-xs font-medium text-primary hover:underline" onClick={() => onOpenExisting?.(l.code)}>
                    Open
                  </button>
                ) : (
                  <span className="ml-auto text-xs text-muted-foreground">Someone else&apos;s lead</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Interested in" value={form.projectCode} onChange={set("projectCode")} options={[{ value: "", label: "Not sure yet" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]} error={errors.projectCode} />
        <LookupSelect list="lead-source" label="Source" value={form.source} onChange={set("source")} error={errors.source} />
        {!editing && access.reassign && (
          <PersonPicker label="Assign to" people={agents} me={me} value={form.assignedTo ? Number(form.assignedTo) : null} onChange={(id) => set("assignedTo")(id ? String(id) : "")} error={errors.assignedTo} />
        )}
        <TempPicker label="Temperature" value={form.priority} onChange={set("priority")} />
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} className="flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline" aria-expanded={more}>
        <Icon name={more ? "arrow-up-s-line" : "arrow-down-s-line"} /> {more ? "Fewer details" : "More details"}
      </button>

      {more && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />
            <LookupSelect list="city" label="City" value={form.city} onChange={set("city")} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox label="Reachable on WhatsApp" checked={form.whatsapp} onChange={set("whatsapp")} />
            <Checkbox label="Lives abroad (overseas)" checked={form.overseas} onChange={set("overseas")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <LookupSelect list="unit-type" label="Looking for" placeholder="Any type" value={form.unitType} onChange={set("unitType")} />
            <div className="flex gap-2">
              <NumberInput label="Size" className="flex-1" min={0} value={form.sizeValue} onChange={set("sizeValue")} />
              <AreaUnitSelect label="Unit" units={allowedUnits} value={form.sizeUnit} onChange={set("sizeUnit")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput label="Budget from" prefix="Rs" min={0} step={500000} value={form.budgetMin} onChange={set("budgetMin")} />
            <NumberInput label="Budget up to" prefix="Rs" min={0} step={500000} value={form.budgetMax} onChange={set("budgetMax")} error={errors.budgetMax} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-base text-muted-foreground">Payment</p>
              <ToggleGroup value={form.paymentPlan ?? ""} onChange={(v) => set("paymentPlan")(v || null)} options={PAYMENT_PLANS} />
            </div>
            <div className="space-y-1">
              <p className="text-base text-muted-foreground">Purpose</p>
              <ToggleGroup value={form.purpose ?? ""} onChange={(v) => set("purpose")(v || null)} options={PURPOSES} />
            </div>
          </div>
          <Textarea label="Notes" rows={3} placeholder="Anything worth remembering about them" value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </div>
      )}
    </Dialog>
  )
}
