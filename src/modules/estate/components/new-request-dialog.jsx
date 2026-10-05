"use client"

import { formatCnic } from "@/lib/cnic"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatAmount } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { NDC_PURPOSES, TYPES, UPDATE_FIELDS, feeFor } from "../constants"
import { createRequest } from "../server/actions"

// Log a request from a buyer or resident: the type, their file, what the type needs (purchaser
// for a transfer, purpose for an NDC…), a title and details, how it came in and who takes it.
// Opens the new request when it's saved.
//   type: preselect a type (type pages) · bookings: bookingOptions() · staff: serviceStaff()
//   types: the types the plan has on · canAssign: services.assign · settings: servicesSettings() for the fee hint · me: { id, name }

const RELATIONS = ["S/O", "D/O", "W/O"].map((r) => ({ value: r, label: r }))
const EMPTY_PURCHASER = { name: "", cnic: "", phone: "", relation: "S/O", guardian: "", address: "" }

// Title suggested for each type until the person types their own
function suggestTitle(f, labels) {
  switch (f.type) {
    case "transfer":
      return f.purchaser.name.trim() ? `Transfer to ${f.purchaser.name.trim()}` : "Transfer of file"
    case "ndc":
      return `NDC for ${(NDC_PURPOSES.find((p) => p.value === f.ndcPurpose)?.label ?? "transfer").toLowerCase()}`
    case "possession":
      return "Possession and demarcation"
    case "document":
      return labels.document(f.documentKind) || "Document request"
    case "record-update":
      return UPDATE_FIELDS.find((u) => u.value === f.updateField)?.label ?? "Record update"
    default:
      return ""
  }
}

export function NewRequestDialog({ type: presetType = null, types: allowed = TYPES, bookings = [], staff = [], canAssign = false, settings = null, me, onClose }) {
  const router = useRouter()
  const types = useList("service-request-type")
  const channels = useList("service-channel")
  const categories = useList("complaint-category")
  const documents = useList("service-document")
  const priorities = useList("service-priority")
  const [f, setF] = useState(() => ({
    type: presetType ?? (allowed.includes("complaint") ? "complaint" : allowed[0]),
    booking: null,
    subject: null, // null: use the suggested title
    details: "",
    channel: channels.defaultValue ?? channels.options[0]?.value ?? "",
    priority: "normal",
    category: categories.defaultValue ?? "",
    documentKind: documents.defaultValue ?? documents.options[0]?.value ?? "",
    updateField: "nominee",
    ndcPurpose: "transfer",
    purchaser: EMPTY_PURCHASER,
    assignTo: me ? String(me.id) : "",
  }))
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch, ...clear) => {
    setF((x) => ({ ...x, ...patch }))
    if (clear.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clear.includes(k) && k !== "form")))
  }
  const setBuyer = (patch, key) => set({ purchaser: { ...f.purchaser, ...patch } }, `purchaser.${key}`)

  const file = bookings.find((b) => b.value === f.booking) ?? null
  const needsFile = f.type !== "complaint"
  const subject = f.subject ?? suggestTitle(f, { document: (v) => documents.label(v) })
  const fee = settings ? feeFor(settings, f.type, { unit: file?.unit ?? null, documentKind: f.documentKind }) : 0
  const typeOptions = types.values.filter((t) => t.isActive && allowed.includes(t.value))
  const fileOptions = useMemo(() => bookings.map((b) => ({ value: b.value, label: b.label, description: [b.value, b.phone].filter(Boolean).join(" · ") })), [bookings])
  const staffOptions = useMemo(() => {
    const list = staff.map((s) => ({ value: String(s.id), label: s.team ? `${s.name} · ${s.team}` : s.name }))
    if (me && !list.some((s) => s.value === String(me.id))) list.unshift({ value: String(me.id), label: `${me.name} (me)` })
    return list
  }, [staff, me])

  const submit = (e) => {
    e?.preventDefault()
    const input = {
      type: f.type,
      booking: f.booking || null,
      subject: subject.trim(),
      details: f.details,
      channel: f.channel || null,
      priority: f.type === "complaint" ? f.priority : "normal",
      category: f.type === "complaint" ? f.category || null : null,
      ndcPurpose: f.type === "ndc" ? f.ndcPurpose : null,
      documentKind: f.type === "document" ? f.documentKind || null : null,
      updateField: f.type === "record-update" ? f.updateField : null,
      purchaser: f.type === "transfer" ? f.purchaser : null,
      assignTo: canAssign && f.assignTo ? Number(f.assignTo) : null,
    }
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => createRequest(input), { loading: "Logging the request…", success: (x) => `Request ${x.code} logged.` })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.error) setErrors({ form: r.error })
      else if (r?.ok) {
        onClose()
        router.push(`/estate-management/requests/${urlCode(r.code)}`)
      }
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={presetType ? `New ${(types.label(presetType) ?? "request").toLowerCase()} request` : "New service request"}
      description="Log what the buyer or resident asked for. It gets a checklist, a fee and a due date."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="add-line" loading={pending} onClick={submit}>
            Log request
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {!presetType && (
          <div role="radiogroup" aria-label="Request type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {typeOptions.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={f.type === t.value}
                onClick={() => set({ type: t.value, subject: null }, "booking")}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  f.type === t.value && "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                <Icon name={t.icon ?? "file-line"} className="text-base text-muted-foreground" />
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <Combobox
            label={needsFile ? "Buyer's file" : "Resident's file (optional)"}
            placeholder="Search buyer, unit or booking no…"
            options={fileOptions}
            value={f.booking}
            onChange={(v) => set({ booking: v ?? null }, "booking")}
            error={errors.booking}
          />
          {file && (
            <p className="mt-1 text-xs text-muted-foreground">
              {file.buyer}
              {file.phone ? ` · ${file.phone}` : ""} · {file.project} {file.unit?.number}
            </p>
          )}
        </div>

        {f.type === "transfer" && (
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">Purchaser</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name as on CNIC" required value={f.purchaser.name} onChange={(e) => setBuyer({ name: e.target.value }, "name")} error={errors["purchaser.name"]} />
              <Input label="CNIC" inputMode="numeric" placeholder="35202-1234567-1" value={f.purchaser.cnic} onChange={(e) => setBuyer({ cnic: formatCnic(e.target.value) }, "cnic")} error={errors["purchaser.cnic"]} />
              <Input label="Mobile" required inputMode="tel" placeholder="0300 1234567" value={f.purchaser.phone} onChange={(e) => setBuyer({ phone: e.target.value }, "phone")} error={errors["purchaser.phone"]} />
              <div className="grid grid-cols-[6rem_1fr] gap-2">
                <Select label="Relation" value={f.purchaser.relation} onChange={(v) => setBuyer({ relation: v }, "relation")} options={RELATIONS} />
                <Input label="Father / husband" value={f.purchaser.guardian} onChange={(e) => setBuyer({ guardian: e.target.value }, "guardian")} error={errors["purchaser.guardian"]} />
              </div>
              <div className="sm:col-span-2">
                <Input label="Postal address" value={f.purchaser.address} onChange={(e) => setBuyer({ address: e.target.value }, "address")} error={errors["purchaser.address"]} />
              </div>
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {f.type === "ndc" && <Select label="NDC for" value={f.ndcPurpose} onChange={(v) => set({ ndcPurpose: v }, "ndcPurpose")} options={NDC_PURPOSES} error={errors.ndcPurpose} />}
          {f.type === "document" && <Select label="Document" value={f.documentKind} onChange={(v) => set({ documentKind: v }, "documentKind")} options={documents.options} error={errors.documentKind} />}
          {f.type === "record-update" && <Select label="Change" value={f.updateField} onChange={(v) => set({ updateField: v }, "updateField")} options={UPDATE_FIELDS} error={errors.updateField} />}
          {f.type === "complaint" && (
            <>
              <Select label="Category" placeholder="Pick a category" value={f.category} onChange={(v) => set({ category: v }, "category")} options={categories.options} error={errors.category} />
              <div>
                <p className="mb-0.5 text-base text-muted-foreground">Priority</p>
                <ToggleGroup value={f.priority} onChange={(v) => v && set({ priority: v })} options={priorities.options} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Input label="Title" required value={subject} onChange={(e) => set({ subject: e.target.value }, "subject")} error={errors.subject} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label={f.type === "complaint" ? "What's wrong, and where" : "Details"} rows={3} value={f.details} onChange={(e) => set({ details: e.target.value }, "details")} error={errors.details} />
          </div>
          <Select label="Came in by" value={f.channel} onChange={(v) => set({ channel: v }, "channel")} options={channels.options} error={errors.channel} />
          {canAssign && <Select label="Assign to" value={f.assignTo} onChange={(v) => set({ assignTo: v }, "assignTo")} options={staffOptions} error={errors.assignTo} />}
        </div>

        {fee > 0 && (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <Icon name="money-rupee-circle-line" className="text-muted-foreground" /> Fee {formatAmount(fee)}, collected before the request is completed.
          </p>
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
      </form>
    </Dialog>
  )
}
