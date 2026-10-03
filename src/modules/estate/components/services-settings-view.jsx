"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { NumberInput } from "@/components/ui/number-input"
import { saveServicesSettings } from "../server/actions"

// Estate Management › Customize › Fees & timelines: what each request costs the buyer, and how
// long the team has before it shows as overdue. New requests use them; logged ones keep theirs.
//   settings: servicesSettings() (DEFAULT_SETTINGS shape) · canEdit

function Money({ label, value, onChange, disabled, hint }) {
  return (
    <div>
      <NumberInput label={label} prefix="Rs" min={0} max={10_000_000} step={500} format={{ maximumFractionDigits: 0 }} value={value} onChange={(v) => onChange(v ?? 0)} disabled={disabled} />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Span({ label = "Complete within", value, onChange, disabled, unit = "days", max }) {
  return <NumberInput label={label} suffix={unit} min={1} max={max ?? (unit === "hours" ? 720 : 365)} value={value} onChange={(v) => onChange(v ?? 1)} disabled={disabled} />
}

export function ServicesSettingsView({ settings, canEdit = false }) {
  const router = useRouter()
  const documents = useList("service-document")
  const priorities = useList("service-priority")
  const [s, setS] = useState(settings)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)
  useUnsavedGuard(dirty)
  const ro = !canEdit
  const set = (type, patch) => setS((x) => ({ ...x, [type]: { ...x[type], ...patch } }))

  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => saveServicesSettings(s), { loading: "Saving fees and timelines…", success: "Saved. New requests use these; requests already logged keep theirs." })
      if (r?.ok) router.refresh()
    })

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Fees & timelines"
        description="What each request costs the buyer, and how long your team has before it shows as overdue."
        actions={
          canEdit &&
          dirty && (
            <>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () =>
                  (await confirm({ title: "Discard unsaved changes?", description: "Your changes to fees and timelines will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true })) &&
                  setS(settings)
                }
              >
                Discard
              </Button>
              <Button leftIcon="check-line" loading={pending} onClick={save}>
                Save changes
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Transfer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Money label="Per marla" value={s.transfer.perMarla} onChange={(v) => set("transfer", { perMarla: v })} disabled={ro} hint="Plots, houses and files" />
            <Money label="Minimum" value={s.transfer.minimum} onChange={(v) => set("transfer", { minimum: v })} disabled={ro} />
            <Money label="Flat fee" value={s.transfer.flat} onChange={(v) => set("transfer", { flat: v })} disabled={ro} hint="Apartments, shops and offices" />
            <Span value={s.transfer.days} onChange={(v) => set("transfer", { days: v })} disabled={ro} />
          </div>
        </SectionCard>
        <SectionCard title="NDC">
          <div className="grid gap-4 sm:grid-cols-2">
            <Money label="Fee" value={s.ndc.fee} onChange={(v) => set("ndc", { fee: v })} disabled={ro} />
            <Span value={s.ndc.days} onChange={(v) => set("ndc", { days: v })} disabled={ro} />
            <Span label="Valid for" value={s.ndc.validDays} onChange={(v) => set("ndc", { validDays: v })} disabled={ro} />
          </div>
        </SectionCard>
        <SectionCard title="Possession">
          <div className="grid gap-4 sm:grid-cols-2">
            <Money label="Possession & demarcation fee" value={s.possession.fee} onChange={(v) => set("possession", { fee: v })} disabled={ro} />
            <Span value={s.possession.days} onChange={(v) => set("possession", { days: v })} disabled={ro} />
          </div>
        </SectionCard>
        <SectionCard title="Documents">
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.values
              .filter((d) => d.isActive || s.document.fees[d.value] != null)
              .map((d) => (
                <Money key={d.value} label={d.label} value={s.document.fees[d.value] ?? 0} onChange={(v) => set("document", { fees: { ...s.document.fees, [d.value]: v } })} disabled={ro} />
              ))}
            <Span value={s.document.days} onChange={(v) => set("document", { days: v })} disabled={ro} />
          </div>
        </SectionCard>
        <SectionCard title="Record updates">
          <div className="grid gap-4 sm:grid-cols-2">
            <Money label="Fee" value={s["record-update"].fee} onChange={(v) => set("record-update", { fee: v })} disabled={ro} hint="Nominee, name, address or mobile changes" />
            <Span value={s["record-update"].days} onChange={(v) => set("record-update", { days: v })} disabled={ro} />
          </div>
        </SectionCard>
        <SectionCard title="Complaint response times">
          <div className="grid gap-4 sm:grid-cols-2">
            {["urgent", "high", "normal", "low"].map((p) => (
              <Span
                key={p}
                label={priorities.label(p)}
                unit="hours"
                max={p === "low" ? 2000 : 720}
                value={s.complaint.hours[p] ?? 72}
                onChange={(v) => set("complaint", { hours: { ...s.complaint.hours, [p]: v } })}
                disabled={ro}
              />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
