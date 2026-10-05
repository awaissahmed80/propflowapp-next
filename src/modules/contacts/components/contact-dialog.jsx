"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { formatCnic, isMaskedCnic } from "@/lib/cnic"
import { formatPkPhone } from "@/lib/phone"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { saveContact } from "../server/actions"

// Add or change a contact, shared by every app (CRM, Operations, Estate Management…). Mobile and
// CNIC belong to one contact only; a clash links to the contact that has them.
//   contact: contactDetail() for editing, or null · defaultType: preselected type for a new one
//   onSaved(code)

const RELATIONS = ["S/O", "D/O", "W/O"].map((r) => ({ value: r, label: r }))
const KINDS = [
  { value: "person", label: "Person", icon: "user-line" },
  { value: "company", label: "Company / firm", icon: "building-line" },
]
const blank = {
  kind: "person",
  name: "",
  phone: "",
  whatsapp: true,
  email: "",
  cnic: "",
  city: "",
  overseas: false,
  address: "",
  company: "",
  designation: "",
  guardianRelation: "S/O",
  guardianName: "",
  notes: "",
  types: [],
}

export function ContactDialog({ contact, defaultType, onClose, onSaved }) {
  const typeList = useList("contact-type")
  const cities = useList("city")
  const linked = useMemo(() => contact?.linkedTypes ?? [], [contact])
  const initial = useMemo(
    () =>
      contact
        ? {
            ...Object.fromEntries(Object.keys(blank).map((k) => [k, contact[k] ?? blank[k]])),
            phone: formatPkPhone(contact.phone ?? ""),
            guardianRelation: contact.guardianRelation ?? "S/O",
            types: [...new Set([...(contact.ownTypes ?? []), ...linked])],
          }
        : { ...blank, city: cities.defaultValue ?? "", types: [defaultType ?? "lead"] },
    [contact, linked, defaultType, cities.defaultValue],
  )
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [clash, setClash] = useState(null)
  const [pending, startTransition] = useTransition()
  const set = (p) => {
    setF((x) => ({ ...x, ...p }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(p).map((k) => [k, undefined])) }))
    setClash(null)
  }
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  // Roles without "See full CNIC numbers" see it masked and can't change it
  const masked = isMaskedCnic(f.cnic)
  const company = f.kind === "company"

  const toggleType = (t) => {
    if (linked.includes(t)) return
    set({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })
  }
  const options = typeList.values.filter((t) => t.isActive || f.types.includes(t.value))

  const save = () =>
    startTransition(async () => {
      setErrors({})
      setClash(null)
      const r = await toastAction(() => saveContact(contact?.code ?? null, f), { loading: "Saving…", success: (x) => (contact ? `${f.name} saved.` : `${f.name} added (${x.code}).`) })
      if (r?.fieldErrors) {
        setErrors(r.fieldErrors)
        if (r.clash) setClash(r.clash)
      } else if (r?.ok) onSaved(r.code)
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={contact ? `Edit ${contact.name}` : "New contact"}
      description="Shared by every app in the workspace: CRM, Operations, Estate Management and the rest."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon={contact ? "check-line" : "user-add-line"} loading={pending} disabled={!f.name.trim() || (contact && !dirty)} onClick={save}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {clash && (
          <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <Icon name="error-warning-line" />
            <span className="flex-1">{errors.cnic ?? errors.phone} One person should have one contact.</span>
            <Link href={`/contacts/${urlCode(clash.code)}`} onClick={onClose} className="font-medium underline-offset-2 hover:underline">
              Open {clash.code}
            </Link>
          </p>
        )}

        <section>
          <p className="mb-1.5 text-base text-muted-foreground">
            Type <span className="text-destructive">*</span>
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contact type">
            {options.map((t) => {
              const on = f.types.includes(t.value)
              const locked = linked.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  title={locked ? "From their records in other apps" : undefined}
                  onClick={() => toggleType(t.value)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                    on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                    locked && "opacity-80",
                  )}
                >
                  <Icon name={locked ? "lock-line" : on ? "check-line" : (t.icon ?? "user-line")} /> {t.label}
                </button>
              )
            })}
          </div>
          {errors.types ? (
            <p className="mt-1 text-xs text-destructive">{errors.types}</p>
          ) : (
            linked.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Locked types come from their leads, bookings and other records.</p>
          )}
        </section>

        <section className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ToggleGroup options={KINDS} value={f.kind} onChange={(kind) => set({ kind })} aria-label="Person or company" />
          </div>
          <div className="sm:col-span-2">
            <Input label={company ? "Firm name" : "Full name"} required value={f.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          </div>
          <Input label="Mobile" required inputMode="tel" placeholder="0300 1234567" value={f.phone} onChange={(e) => set({ phone: e.target.value })} error={clash ? undefined : errors.phone} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
            <Checkbox label="Reachable on WhatsApp" checked={f.whatsapp} onChange={(v) => set({ whatsapp: v })} />
            <Checkbox label="Lives abroad (overseas Pakistani)" checked={f.overseas} onChange={(v) => set({ overseas: v })} />
          </div>
        </section>

        {!company && (
          <section className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <div>
              <Input label="CNIC" inputMode="numeric" placeholder="35202-1234567-1" value={f.cnic} disabled={masked} onChange={(e) => set({ cnic: formatCnic(e.target.value) })} error={clash ? undefined : errors.cnic} />
              {masked && <p className="mt-1 text-xs text-muted-foreground">Your role sees CNICs masked, so it stays as it is.</p>}
            </div>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <Select label="Relation" options={RELATIONS} value={f.guardianRelation} onChange={(v) => set({ guardianRelation: v ?? "S/O" })} error={errors.guardianRelation} />
              <Input label="Father's / husband's name" value={f.guardianName} onChange={(e) => set({ guardianName: e.target.value })} error={errors.guardianName} />
            </div>
          </section>
        )}

        <section className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          {!company && <Input label="Company / firm" value={f.company} onChange={(e) => set({ company: e.target.value })} error={errors.company} />}
          <Input label={company ? "Contact person / role" : "Designation"} value={f.designation} onChange={(e) => set({ designation: e.target.value })} error={errors.designation} />
          <LookupSelect list="city" label="City" placeholder="Pick a city" empty="Not set" value={f.city} onChange={(v) => set({ city: v ?? "" })} error={errors.city} />
          <div className={cn(company && "sm:col-span-2")}>
            <Input label="Address" value={f.address} onChange={(e) => set({ address: e.target.value })} error={errors.address} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Notes" rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} error={errors.notes} />
          </div>
        </section>
      </div>
    </Dialog>
  )
}
