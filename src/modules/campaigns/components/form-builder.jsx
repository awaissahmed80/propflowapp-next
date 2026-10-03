"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { useList } from "@/modules/lookups/context"
import { LeadStatusBadge } from "@/modules/crm/components/lead-parts"
import { CopyField } from "@/components/copy-field"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { ColorPicker } from "@/components/ui/color-picker"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { FIELD_PRESETS, accentHex, FIELD_TYPES, MAP_TARGETS, channelIcon, percent, utmFor } from "../constants"
import { saveForm, setFormStatus, testFormEntry } from "../server/form-actions"
import { CodeField, formLinks } from "./form-embed-code"
import { FormStatusBadge } from "./forms-view"
import { PublicLeadForm } from "./public-form"

// Campaigns › Lead Forms › one form: questions with a live preview (Build), wording, lead routing
// and what happens after submitting (Settings), links and embed snippets (Share & embed), and the
// leads it brought in (Entries).
//   form: getForm() · workspace: the workspace slug · campaigns / projects: pick-list options
//   agents: [{ id, name }] for "assign new leads to" · canEdit: campaigns › edit

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const snapshot = (f) => ({ name: f.name, campaign: f.campaign?.code ?? "", project: f.project?.code ?? "", fields: f.fields, settings: f.settings })

function Figure({ label, value, note }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {note && <span className="truncate text-[13px] text-muted-foreground">{note}</span>}
      </div>
    </div>
  )
}

// One question: its wording, options (dropdowns and choices), required, order
function FieldEditor({ field, index, count, readOnly, onChange, onMove, onRemove }) {
  const t = FIELD_TYPES[field.type]
  const fixed = t?.fixed
  return (
    <li className="rounded-xl border bg-background p-3 shadow-xs">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon name={t?.icon ?? "input-field"} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <Input aria-label="Question" value={field.label} readOnly={readOnly} onChange={(e) => onChange({ label: e.target.value })} />
          {t?.options && (
            <Textarea
              aria-label="Options, one per line"
              placeholder="Options, one per line"
              rows={Math.min(6, Math.max(2, field.options?.length ?? 2))}
              readOnly={readOnly}
              value={(field.options ?? []).join("\n")}
              onChange={(e) => onChange({ options: e.target.value.split("\n") })}
            />
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{t?.label ?? field.type}</span>
            {field.mapTo && (
              <span className="flex items-center gap-1">
                <Icon name="links-line" /> {MAP_TARGETS[field.mapTo]}
              </span>
            )}
            {fixed ? (
              <span className="flex items-center gap-1">
                <Icon name="lock-line" /> Always required
              </span>
            ) : (
              <Checkbox label="Required" checked={Boolean(field.required)} disabled={readOnly} onChange={(v) => onChange({ required: v })} />
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 flex-col">
            <IconButton icon="arrow-up-s-line" variant="ghost" size="sm" tooltip="Move up" disabled={index === 0} onClick={() => onMove(-1)} />
            <IconButton icon="arrow-down-s-line" variant="ghost" size="sm" tooltip="Move down" disabled={index === count - 1} onClick={() => onMove(1)} />
            {!fixed && <IconButton icon="delete-bin-6-line" variant="ghost" size="sm" tooltip="Remove" onClick={onRemove} />}
          </div>
        )}
      </div>
    </li>
  )
}

export function FormBuilder({ form, workspace, workspaceName, campaigns = [], projects = [], agents = [], canEdit = false }) {
  const router = useRouter()
  const sources = useList("lead-source")
  const cities = useList("city")
  const [pending, startTransition] = useTransition()

  // The draft follows the saved form; a refresh after saving (new key) starts it again
  const saved = useMemo(() => snapshot(form), [form])
  const savedKey = JSON.stringify(saved)
  const [draft, setDraft] = useState(saved)
  const [seen, setSeen] = useState(savedKey)
  if (seen !== savedKey) {
    setSeen(savedKey)
    setDraft(saved)
  }
  const dirty = canEdit && JSON.stringify(draft) !== savedKey

  // Leaving with unsaved changes (links, Back button, closing the tab) asks first
  useUnsavedGuard(dirty)

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setSetting = (k, v) => setDraft((d) => ({ ...d, settings: { ...d.settings, [k]: v } }))
  const setField = (i, patch) => setDraft((d) => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }))
  const moveField = (i, dir) =>
    setDraft((d) => {
      const fields = [...d.fields]
      const [f] = fields.splice(i, 1)
      fields.splice(i + dir, 0, f)
      return { ...d, fields }
    })
  const addField = (preset) =>
    setDraft((d) => {
      const base = preset.key.replace(/[^a-z]/g, "") || "field"
      let id = base
      let n = 2
      while (d.fields.some((f) => f.id === id)) id = `${base}${n++}`
      const field = { id, required: false, ...preset.field }
      // Consent stays last, just above the button
      const consentAt = d.fields.findIndex((f) => f.type === "consent")
      const fields = [...d.fields]
      fields.splice(field.type === "consent" || consentAt < 0 ? fields.length : consentAt, 0, field)
      return { ...d, fields }
    })
  // One email, city and consent question each, and one question per lead detail
  const presets = FIELD_PRESETS.filter(
    (p) => !(["email", "city", "consent"].includes(p.field.type) && draft.fields.some((f) => f.type === p.field.type)) && !(p.field.mapTo && draft.fields.some((f) => f.mapTo === p.field.mapTo)),
  )

  const save = () =>
    startTransition(async () => {
      const clean = {
        ...draft,
        campaign: draft.campaign || null,
        project: draft.project || null,
        fields: draft.fields.map((f) => (f.options ? { ...f, options: f.options.map((o) => o.trim()).filter(Boolean) } : f)),
      }
      const r = await toastAction(() => saveForm(form.code, clean), { loading: "Saving…", success: "Form saved." })
      if (r?.ok) router.refresh()
    })
  const toggleStatus = async () => {
    const next = form.status === "active" ? "paused" : "active"
    if (next === "paused") {
      const ok = await confirm({
        title: `Take “${form.name}” offline?`,
        description: "The form shows as closed wherever it's shared or embedded, and stops taking new leads until you open it again.",
        confirmLabel: "Pause form",
        icon: "pause-circle-line",
      })
      if (!ok) return
    }
    startTransition(async () => {
      const r = await toastAction(() => setFormStatus(form.code, next), {
        loading: next === "paused" ? "Pausing…" : "Opening…",
        success: next === "paused" ? "Form paused: it shows as closed." : "Form is accepting entries.",
      })
      if (r?.ok) router.refresh()
    })
  }

  // The preview sends a real lead, marked as a test (to the saved version of the form)
  const test = async (values) => {
    const r = await testFormEntry(form.code, values)
    if (r?.ok) router.refresh()
    return r
  }

  const links = formLinks(workspace, form.code)
  const [utmSource, utmMedium] = utmFor(draft.settings.channel || "facebook-ads")
  const tracked = `${links.hosted}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}`
  const preview = { code: form.code, name: draft.name, status: form.status, fields: draft.fields, settings: draft.settings }
  const campaignOptions = [{ value: "", label: "No campaign" }, ...campaigns.map((c) => ({ value: c.value, label: c.label }))]
  const projectOptions = [{ value: "", label: "Any project" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]
  const assignOptions = [{ value: "", label: "Leave unassigned" }, { value: "round-robin", label: "CRM assignment rules, then in turn" }, ...agents.map((a) => ({ value: String(a.id), label: a.name }))]
  const channelOptions = sources.options.map((o) => ({ ...o, icon: channelIcon(o.value) }))

  const tabs = [
    {
      value: "build",
      label: "Build",
      icon: "survey-line",
      content: (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="space-y-3">
            <ul className="space-y-2">
              {draft.fields.map((f, i) => (
                <FieldEditor
                  key={f.id}
                  field={f}
                  index={i}
                  count={draft.fields.length}
                  readOnly={!canEdit}
                  onChange={(p) => setField(i, p)}
                  onMove={(d) => moveField(i, d)}
                  onRemove={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
            {canEdit && (
              <DropdownMenu
                align="start"
                className="w-64"
                items={presets.map((p) => ({ key: p.key, label: p.label, icon: FIELD_TYPES[p.field.type]?.icon, onClick: () => addField(p) }))}
                trigger={
                  <Button variant="outline" leftIcon="add-line">
                    Add question
                  </Button>
                }
              />
            )}
            <p className="text-xs text-muted-foreground">Name and mobile create the contact and lead. Linked questions fill the lead&apos;s interest; other answers are saved in the lead&apos;s notes.</p>
          </div>
          <div className="xl:sticky xl:top-20 xl:self-start">
            <p className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span>Preview</span>
              <span className={cn(dirty && "text-amber-700 dark:text-amber-400")}>{dirty ? "Save to test your changes" : canEdit ? "Submitting adds a test lead to CRM" : ""}</span>
            </p>
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/60">
              <PublicLeadForm workspace={workspace} form={preview} cities={cities.options} workspaceName={workspaceName} onTest={canEdit ? test : () => ({ error: "Your role can't send test entries." })} />
            </div>
          </div>
        </div>
      ),
    },
    {
      value: "settings",
      label: "Settings",
      icon: "settings-3-line",
      content: (
        <fieldset disabled={!canEdit} className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Form" bodyClassName="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Form name" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <Input label="Heading" value={draft.settings.title ?? ""} onChange={(e) => setSetting("title", e.target.value)} />
            <Input label="Button label" value={draft.settings.submitLabel ?? ""} onChange={(e) => setSetting("submitLabel", e.target.value)} />
            <div className="sm:col-span-2">
              <Textarea label="Intro" rows={2} value={draft.settings.intro ?? ""} onChange={(e) => setSetting("intro", e.target.value)} />
            </div>
            <ColorPicker label="Color" value={accentHex(draft.settings.accent)} onChange={(hex) => setSetting("accent", hex)} disabled={!canEdit} />
          </SectionCard>
          <SectionCard title="Leads" bodyClassName="grid gap-4 sm:grid-cols-2">
            <Select
              label="Campaign"
              value={draft.campaign}
              disabled={!canEdit}
              onChange={(v) => {
                const c = campaigns.find((x) => x.value === v)
                set({ campaign: v, project: c?.project ?? draft.project })
              }}
              options={campaignOptions}
            />
            <Select label="Project" value={draft.project} disabled={!canEdit} onChange={(v) => set({ project: v })} options={projectOptions} />
            <Select label="Default channel" value={draft.settings.channel} disabled={!canEdit} onChange={(v) => setSetting("channel", v)} options={channelOptions} />
            <Select label="Assign new leads to" value={String(draft.settings.assignTo ?? "")} disabled={!canEdit} onChange={(v) => setSetting("assignTo", v)} options={assignOptions} />
            <p className="text-xs text-muted-foreground sm:col-span-2">The default channel is used when a link has no utm_source tag. Assigned leads get a first call planned 15 minutes after they arrive.</p>
          </SectionCard>
          <SectionCard title="After submitting" bodyClassName="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Textarea label="Thank-you message" rows={2} value={draft.settings.successMessage ?? ""} onChange={(e) => setSetting("successMessage", e.target.value)} />
            </div>
            <Input label="WhatsApp number" placeholder="+92 300 1234567" value={draft.settings.whatsapp ?? ""} onChange={(e) => setSetting("whatsapp", e.target.value)} />
            <Input label="Redirect to (optional)" placeholder="https://" value={draft.settings.redirectUrl ?? ""} onChange={(e) => setSetting("redirectUrl", e.target.value)} />
          </SectionCard>
        </fieldset>
      ),
    },
    {
      value: "share",
      label: "Share & embed",
      icon: "code-s-slash-line",
      content: (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Embed on your website" bodyClassName="space-y-4">
            <CodeField label="Script (recommended)" value={links.script} hint="Paste where the form should appear. It resizes itself and works on WordPress, Wix and custom sites." />
            <CodeField label="Plain iframe" value={links.iframe(draft.name)} hint="For site builders that don't allow scripts." />
          </SectionCard>
          <SectionCard title="Link" bodyClassName="space-y-4">
            <div>
              <CopyField label="Hosted form" value={links.hosted} />
              <p className="mt-1 text-xs text-muted-foreground">For WhatsApp broadcasts, SMS, QR codes at expos and link-in-bio.</p>
            </div>
            <div>
              <CopyField label="With tracking" value={tracked} />
              <p className="mt-1 text-xs text-muted-foreground">utm_source decides the lead&apos;s channel: facebook, instagram, google, portal, sms or expo.</p>
            </div>
            {form.status !== "active" && (
              <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <Icon name="pause-circle-line" /> Paused: visitors see &ldquo;This form is closed&rdquo;.
              </p>
            )}
            <Button variant="outline" leftIcon="external-link-line" nativeButton={false} render={<a href={links.hosted} target="_blank" rel="noreferrer" />}>
              Open hosted form
            </Button>
          </SectionCard>
        </div>
      ),
    },
    {
      value: "entries",
      label: "Entries",
      icon: "inbox-line",
      count: form.entries,
      content: form.entriesList.length ? (
        <div className="divide-y rounded-xl border bg-background shadow-xs">
          {form.entriesList.map((l, i) => {
            const body = (
              <>
                <Avatar name={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", l.code ? "group-hover:text-primary" : "text-muted-foreground")}>{l.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[l.code, l.source ? sources.label(l.source) : "No channel", timeAgo(l.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="hidden w-36 truncate text-sm text-muted-foreground md:block">{l.agent ?? "Unassigned"}</span>
                <LeadStatusBadge status={l.status} />
              </>
            )
            return l.code ? (
              <Link key={l.code} href={`/crm/leads?lead=${urlCode(l.code)}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                {body}
              </Link>
            ) : (
              <div key={`hidden-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                {body}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
          <Icon name="inbox-line" className="text-2xl" />
          <p className="mt-1">No entries yet. Share the link or embed the form, and entries arrive here and in CRM.</p>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/campaigns/forms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Lead Forms
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{draft.name || "Untitled form"}</h1>
              <FormStatusBadge status={form.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{form.code}</span>
              <span className="flex items-center gap-1">
                <Icon name="megaphone-line" />
                {form.campaign ? (
                  <Link href={`/campaigns/all/${urlCode(form.campaign.code)}`} className="hover:text-foreground hover:underline">
                    {form.campaign.name}
                  </Link>
                ) : (
                  "No campaign"
                )}
              </span>
              {form.project && (
                <span className="flex items-center gap-1">
                  <Icon name="community-line" /> {form.project.name}
                </span>
              )}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" leftIcon={form.status === "active" ? "pause-line" : "play-line"} disabled={pending} onClick={toggleStatus}>
                {form.status === "active" ? "Pause" : "Accept entries"}
              </Button>
              <Button leftIcon="save-3-line" loading={pending} disabled={!dirty} onClick={save}>
                {dirty ? "Save changes" : "Saved"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-background px-4 py-3 shadow-xs md:grid-cols-4">
        <Figure label="Views" value={number(form.views)} />
        <Figure label="Entries" value={number(form.entries)} />
        <Figure label="Conversion" value={percent(form.conversion)} note="entries per view" />
        <Figure label="Last entry" value={form.lastEntryAt ? timeAgo(form.lastEntryAt) : "—"} />
      </section>

      <Tabs tabs={tabs} />
    </div>
  )
}
