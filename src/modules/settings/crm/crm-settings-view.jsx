"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"
import { NumberInput } from "@/components/ui/number-input"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { saveLeadScoring, savePipelineRules } from "./actions"

// One rule: title and description on the left, the switch on the right, extra settings below
function Rule({ icon, title, description, checked, onChange, disabled, children }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch aria-label={title} checked={checked} disabled={disabled} onChange={onChange} />
      </div>
      {children && <div className="mt-3 pl-13">{children}</div>}
    </div>
  )
}

// title / description: the page header (Settings › CRM, or CRM › Customize)
export function CrmSettingsView({ settings, canEdit, title = "CRM", description = "How your team works leads" }) {
  const router = useRouter()
  const [rules, setRules] = useState({ autoAssign: settings.autoAssign, statusNote: settings.statusNote, stale: settings.stale, staleDays: settings.staleDays })
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [days, setDays] = useState(settings.staleDays) // typed; saved when committed

  // Each change saves straight away
  const save = (patch, changed) => {
    const before = rules
    const next = { ...rules, ...patch }
    setRules(next)
    setError("")
    startTransition(async () => {
      const r = await toastAction(() => savePipelineRules(next, changed), { loading: "Saving…", success: "Saved." })
      if (r.fieldErrors) {
        setRules(before)
        setError(r.fieldErrors.staleDays ?? "Check the settings and try again.")
      } else if (r.error) {
        setRules(before)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Pipeline rules</h2>
        <p className="text-sm text-muted-foreground">Automation and defaults for your leads</p>
        <div className="mt-4 divide-y rounded-xl border bg-background shadow-xs">
          <Rule
            icon="shuffle-line"
            title="Auto-assign new leads"
            description="New leads with no one picked go round-robin to active reps."
            checked={rules.autoAssign}
            disabled={!canEdit || pending}
            onChange={(v) => save({ autoAssign: v }, "autoAssign")}
          />
          <Rule
            icon="sticky-note-add-line"
            title="Require a note before a stage change"
            description="Agents must say what happened before moving a lead to another stage. Logging a call or visit counts as the note."
            checked={rules.statusNote}
            disabled={!canEdit || pending}
            onChange={(v) => save({ statusNote: v }, "statusNote")}
          />
          <Rule
            icon="hourglass-line"
            title="Flag stale leads"
            description="Highlight open leads with no activity after a set number of days."
            checked={rules.stale}
            disabled={!canEdit || pending}
            onChange={(v) => save({ stale: v }, "stale")}
          >
            {rules.stale && (
              <div className="w-40">
                <NumberInput
                  label="Days"
                  min={1}
                  max={365}
                  disabled={!canEdit || pending}
                  value={days}
                  onChange={setDays}
                  onValueCommitted={(n) => (n && n !== rules.staleDays ? save({ staleDays: n }, "staleDays") : setDays(rules.staleDays))}
                  error={error || undefined}
                />
              </div>
            )}
          </Rule>
        </div>
        {!canEdit && <p className="mt-3 text-sm text-muted-foreground">Your role can&apos;t change these. Ask an administrator.</p>}
      </section>

      <LeadScoring settings={settings} canEdit={canEdit} />
    </div>
  )
}

// Lead scoring: switched on/off straight away; the numbers are saved together (the three parts
// have to add up to 100%)
const PARTS = [
  { key: "engagement", label: "Engagement", icon: "pulse-line", text: "Contacts that reached them recently. Each activity type's points are set in Lists & Labels." },
  { key: "affordability", label: "Affordability", icon: "wallet-3-line", text: "Their budget against the cheapest available unit that matches what they want." },
  { key: "intent", label: "Intent", icon: "focus-3-line", text: "How far along the pipeline they are, and how much of what they want is known." },
]

function LeadScoring({ settings, canEdit }) {
  const router = useRouter()
  const saved = {
    scoring: settings.scoring,
    ...settings.weights,
    engagementDays: settings.engagementDays,
    engagementTarget: settings.engagementTarget,
  }
  const [form, setForm] = useState(saved)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const total = PARTS.reduce((n, p) => n + (Number(form[p.key]) || 0), 0)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const save = (next = form) => {
    setErrors({})
    startTransition(async () => {
      const r = await toastAction(() => saveLeadScoring(next), { loading: "Saving…", success: "Saved. Scores update the next time leads are opened." })
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (!r.error) router.refresh()
    })
  }
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const off = !canEdit || pending

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Lead scoring</h2>
      <p className="text-sm text-muted-foreground">A 0–100 score on every lead, from how engaged they are, whether they can afford it, and how serious they are</p>
      <div className="mt-4 divide-y rounded-xl border bg-background shadow-xs">
        <Rule
          icon="medal-line"
          title="Score leads"
          description="Show a score and grade (A–D) on leads, and a Score column in the list."
          checked={form.scoring}
          disabled={off}
          onChange={(v) => {
            const next = { ...form, scoring: v }
            setForm(next)
            save(next)
          }}
        />
        {form.scoring && (
          <>
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-semibold">How the score is made up</p>
                <span className={cn("text-sm tabular-nums", total === 100 ? "text-muted-foreground" : "font-medium text-destructive")}>Total {total}%</span>
              </div>
              {PARTS.map((p) => (
                <div key={p.key} className="flex items-center gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg text-muted-foreground">
                    <Icon name={p.icon} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.label}</p>
                    <p className="text-sm text-muted-foreground">{p.text}</p>
                  </div>
                  <div className="w-28 shrink-0">
                    <NumberInput aria-label={`${p.label} weight`} min={0} max={100} suffix="%" disabled={off} value={form[p.key]} onChange={(v) => set({ [p.key]: v ?? 0 })} />
                  </div>
                </div>
              ))}
              {errors.weights && <p className="text-sm text-destructive">{errors.weights}</p>}
            </div>
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <NumberInput label="Count activity from the last" min={7} max={365} suffix="days" disabled={off} value={form.engagementDays} onChange={(v) => set({ engagementDays: v })} error={errors.engagementDays} />
              <NumberInput
                label="Points for a fully engaged lead"
                min={1}
                max={500}
                suffix="points"
                disabled={off}
                value={form.engagementTarget}
                onChange={(v) => set({ engagementTarget: v })}
                error={errors.engagementTarget}
              />
              <p className="text-sm text-muted-foreground sm:col-span-2">
                With the defaults, two calls, a WhatsApp chat and a site visit in the last 30 days make a fully engaged lead. Points per activity type, and whether an outcome raises or lowers the score, are set in{" "}
                <Link href="/settings/lists" className="text-primary hover:underline">
                  Lists &amp; Labels
                </Link>
                . A missed follow-up takes 3 points off; an unknown budget counts as a low 40% affordability.
              </p>
            </div>
            {canEdit && (
              <div className="flex justify-end gap-2 px-5 py-3">
                {dirty && (
                  <Button variant="outline" disabled={pending} onClick={() => (setForm(saved), setErrors({}))}>
                    Undo changes
                  </Button>
                )}
                <Button leftIcon="save-line" loading={pending} disabled={!dirty || total !== 100} onClick={() => save()}>
                  Save scoring
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
