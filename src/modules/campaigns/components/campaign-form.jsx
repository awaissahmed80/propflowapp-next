"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { PersonPicker } from "@/components/person-picker"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { moveCampaign, saveCampaign } from "../server/campaign-actions"
import { GOAL_METRIC, GOAL_METRICS } from "../constants"

// New / edit campaign, as a full page: what it promotes, when it runs, its channels with budget
// and spend so far, and its goals. A new one is saved as a draft or launched straight away.
//   campaign: getCampaign() when editing; projects: [{ code, name }]; people: assignableAgents()
//   (the owner picker); me: the signed-in user's id

let seq = 0
const key = () => `row-${++seq}`

const blank = (me, objective, channel) => ({
  name: "",
  objective: objective ?? "",
  project: "",
  ownerId: me ?? null,
  startDate: "",
  endDate: "",
  audience: "",
  offer: "",
  notes: "",
  channels: [{ key: key(), channel: channel ?? "", budget: null, spend: 0 }],
  goals: [
    { key: key(), metric: "leads", target: null },
    { key: key(), metric: "bookings", target: null },
  ],
})

const fromCampaign = (c) => ({
  name: c.name,
  objective: c.objective ?? "",
  project: c.project?.code ?? "",
  ownerId: c.owner?.id ?? null,
  startDate: c.startDate ?? "",
  endDate: c.endDate ?? "",
  audience: c.audience ?? "",
  offer: c.offer ?? "",
  notes: c.notes ?? "",
  channels: c.channels.map((ch) => ({ key: key(), channel: ch.channel, budget: ch.budget ?? null, spend: ch.spend ?? 0, impressions: ch.impressions ?? 0, clicks: ch.clicks ?? 0 })),
  goals: c.goals.map((g) => ({ key: key(), metric: g.metric, target: g.target })),
})

function RemoveButton({ label, onClick, disabled }) {
  return <Button variant="ghost" size="icon" leftIcon="delete-bin-6-line" aria-label={label} disabled={disabled} onClick={onClick} />
}

export function CampaignForm({ campaign = null, projects, people, me }) {
  const editing = Boolean(campaign)
  const router = useRouter()
  const objectives = useList("campaign-objective")
  const sources = useList("lead-source")
  // A new one starts as a launch on Facebook ads (when the lists still have them)
  const first = (list, preferred) => (list.options.some((o) => o.value === preferred) ? preferred : (list.defaultValue ?? list.options[0]?.value))
  const [form, setForm] = useState(() => (editing ? fromCampaign(campaign) : blank(me, first(objectives, "launch"), first(sources, "facebook-ads"))))
  // Keys as the server sends them: "name", "channels.0.budget", "goals.1.target"…
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(null)

  const cancelTo = editing ? `/campaigns/all/${urlCode(campaign.code)}` : "/campaigns/all"
  const clear = (...keys) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))))
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    clear(k)
    setFormError("")
  }
  const setRow = (list, i, patch) => setForm((f) => ({ ...f, [list]: f[list].map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  // Removing a row shifts the ones below it, so their errors no longer line up
  const removeRow = (list, i) => {
    set(
      list,
      form[list].filter((_, j) => j !== i),
    )
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${list}.`))))
  }
  const budget = form.channels.reduce((s, ch) => s + (Number(ch.budget) || 0), 0)
  const usedChannels = form.channels.map((ch) => ch.channel)
  const usedMetrics = form.goals.map((g) => g.metric)
  const projectOptions = [{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]
  // A channel switched off in the list still shows on campaigns that use it
  const channelOptions = (current) => [
    ...sources.options.filter((c) => c.value === current || !usedChannels.includes(c.value)),
    ...(current && !sources.options.some((c) => c.value === current) ? [{ value: current, label: sources.label(current) }] : []),
  ]

  // Quick checks before the server's own
  const check = (launch) => {
    const e = {}
    if (!form.name.trim()) e.name = "Give the campaign a name."
    if (launch && !form.startDate) e.startDate = "Set a start date to launch."
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "Ends before it starts."
    if (!form.channels.length) e.channels = "Add at least one channel."
    form.channels.forEach((ch, i) => {
      if (!ch.channel) e[`channels.${i}.channel`] = "Pick the channel."
      if (!ch.budget) e[`channels.${i}.budget`] = "Required"
    })
    form.goals.forEach((g, i) => {
      if (!g.target) e[`goals.${i}.target`] = "Required"
    })
    return e
  }

  const submit = async (launch) => {
    const e = check(launch)
    setErrors(e)
    if (Object.keys(e).length) return setFormError("Check the highlighted fields.")
    setFormError("")
    setSaving(launch ? "launch" : "save")
    const input = {
      name: form.name.trim(),
      objective: form.objective || null,
      project: form.project || null,
      ownerId: form.ownerId || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      audience: form.audience.trim(),
      offer: form.offer.trim(),
      notes: form.notes.trim(),
      channels: form.channels.map((ch) => ({ channel: ch.channel, budget: ch.budget ?? 0, spend: ch.spend ?? 0, impressions: ch.impressions ?? 0, clicks: ch.clicks ?? 0 })),
      goals: form.goals.map((g) => ({ metric: g.metric, target: g.target })),
    }
    const r = await toastAction(
      async () => {
        const saved = await saveCampaign(input, campaign?.code ?? null)
        if (!launch || !saved?.ok) return saved
        // Saved; launching may still fail (then it stays a draft)
        const moved = await moveCampaign(saved.code, "launch")
        return moved?.error ? { ...saved, ok: false, error: `Saved as a draft, but it couldn't launch: ${moved.error}` } : { ...saved, status: moved.status }
      },
      {
        loading: launch ? "Saving and launching…" : "Saving…",
        success: (x) => (launch ? (x.status === "scheduled" ? "Campaign scheduled." : "Campaign launched.") : editing ? "Changes saved." : "Campaign saved as a draft."),
      },
    )
    if (r?.code) return router.push(`/campaigns/all/${urlCode(r.code)}`)
    setSaving(null)
    if (r?.fieldErrors) {
      setErrors(r.fieldErrors)
      setFormError("Check the highlighted fields.")
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(false)
      }}
      noValidate
      className="flex min-h-[calc(100svh-3.5rem)] flex-col"
    >
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <Link href={cancelTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left-line" /> {editing ? campaign.name : "Campaigns"}
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{editing ? "Edit campaign" : "New campaign"}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">What it&apos;s promoting, when it runs, where the ads go and what counts as success.</p>
        </div>

        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <Icon name="error-warning-line" className="mt-0.5" />
            {formError}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Campaign" bodyClassName="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Campaign name" required placeholder="e.g. Skyline Enclave Phase 2 launch" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
            </div>
            <LookupSelect list="campaign-objective" label="Objective" empty="No objective" value={form.objective} onChange={(v) => set("objective", v)} error={errors.objective} />
            <Select label="Project" value={form.project} onChange={(v) => set("project", v)} options={projectOptions} error={errors.project} />
            <DatePicker label="Starts" value={form.startDate} onChange={(v) => set("startDate", v)} error={errors.startDate} />
            <DatePicker label="Ends" placeholder="No end date" value={form.endDate} minDate={form.startDate || undefined} onChange={(v) => set("endDate", v)} error={errors.endDate} />
            <PersonPicker label="Campaign owner" people={people} me={me} value={form.ownerId} onChange={(v) => set("ownerId", v)} noneLabel="No owner" error={errors.ownerId} />
          </SectionCard>

          <SectionCard title="Audience & offer" bodyClassName="grid gap-4">
            <Textarea
              label="Audience"
              rows={2}
              placeholder="e.g. Lahore families 28–55; overseas Pakistanis in UAE and UK"
              value={form.audience}
              onChange={(e) => set("audience", e.target.value)}
              error={errors.audience}
            />
            <Textarea label="Offer" rows={2} placeholder="e.g. 25% down payment, 3-year installments, no booking fee this month" value={form.offer} onChange={(e) => set("offer", e.target.value)} error={errors.offer} />
            <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} error={errors.notes} />
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title={`Channels & budget · ${formatPkr(budget)}`}
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon="add-line"
                disabled={usedChannels.length >= sources.options.length}
                onClick={() => set("channels", [...form.channels, { key: key(), channel: sources.options.find((c) => !usedChannels.includes(c.value))?.value ?? "", budget: null, spend: 0 }])}
              >
                Add channel
              </Button>
            }
          >
            {errors.channels && <p className="mb-2 text-sm text-destructive">{errors.channels}</p>}
            <div className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_2.5rem] gap-2 pb-1 text-xs text-muted-foreground">
              <span>Channel</span>
              <span>Budget</span>
              <span>Spent so far</span>
            </div>
            <ul className="space-y-2">
              {form.channels.map((ch, i) => (
                <li key={ch.key} className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_2.5rem] items-start gap-2">
                  <Select
                    aria-label="Channel"
                    value={ch.channel}
                    onChange={(v) => {
                      setRow("channels", i, { channel: v })
                      clear(`channels.${i}.channel`)
                    }}
                    options={channelOptions(ch.channel)}
                    error={errors[`channels.${i}.channel`]}
                  />
                  <NumberInput
                    aria-label="Budget"
                    prefix="Rs"
                    min={0}
                    step={50_000}
                    showSteppers={false}
                    format={{ maximumFractionDigits: 0 }}
                    value={ch.budget}
                    onChange={(v) => {
                      setRow("channels", i, { budget: v })
                      clear(`channels.${i}.budget`)
                    }}
                    error={errors[`channels.${i}.budget`]}
                  />
                  <NumberInput
                    aria-label="Spent so far"
                    prefix="Rs"
                    min={0}
                    step={10_000}
                    showSteppers={false}
                    format={{ maximumFractionDigits: 0 }}
                    value={ch.spend}
                    onChange={(v) => {
                      setRow("channels", i, { spend: v })
                      clear(`channels.${i}.spend`)
                    }}
                    error={errors[`channels.${i}.spend`]}
                  />
                  <RemoveButton label="Remove channel" disabled={form.channels.length === 1} onClick={() => removeRow("channels", i)} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Channels are CRM&apos;s lead sources, so each lead&apos;s source shows which channel it came from. Spend updates automatically once Meta and Google Ads are connected.
            </p>
          </SectionCard>

          <SectionCard
            title="Goals"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon="add-line"
                disabled={usedMetrics.length >= GOAL_METRICS.length}
                onClick={() => set("goals", [...form.goals, { key: key(), metric: GOAL_METRICS.find((m) => !usedMetrics.includes(m.value)).value, target: null }])}
              >
                Add goal
              </Button>
            }
          >
            {form.goals.length ? (
              <ul className="space-y-2">
                {form.goals.map((g, i) => (
                  <li key={g.key} className="grid grid-cols-[minmax(0,1fr)_11rem_2.5rem] items-start gap-2">
                    <Select
                      aria-label="Goal"
                      value={g.metric}
                      onChange={(v) => setRow("goals", i, { metric: v })}
                      options={GOAL_METRICS.filter((m) => m.value === g.metric || !usedMetrics.includes(m.value)).map((m) => ({ value: m.value, label: m.label }))}
                    />
                    <NumberInput
                      aria-label="Target"
                      prefix={GOAL_METRIC[g.metric]?.money ? "Rs" : undefined}
                      suffix={GOAL_METRIC[g.metric]?.lowerIsBetter ? "max" : undefined}
                      min={0}
                      showSteppers={false}
                      format={{ maximumFractionDigits: 0 }}
                      value={g.target}
                      onChange={(v) => {
                        setRow("goals", i, { target: v })
                        clear(`goals.${i}.target`)
                      }}
                      error={errors[`goals.${i}.target`]}
                    />
                    <RemoveButton label="Remove goal" onClick={() => removeRow("goals", i)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No goals yet. Add targets for leads, site visits, bookings or cost per lead.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Results come from CRM: leads attributed to the campaign, their site visits and bookings.</p>
          </SectionCard>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelTo} />}>
          Cancel
        </Button>
        {editing ? (
          <Button type="submit" leftIcon="save-3-line" loading={saving === "save"}>
            Save changes
          </Button>
        ) : (
          <>
            <Button type="submit" variant="outline" leftIcon="draft-line" loading={saving === "save"} disabled={saving === "launch"}>
              Save as draft
            </Button>
            <Button leftIcon="rocket-2-line" loading={saving === "launch"} disabled={saving === "save"} onClick={() => submit(true)}>
              Save &amp; launch
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
