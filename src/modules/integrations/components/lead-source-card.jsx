"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { integrationByKey } from "../catalog"
import { disconnectLeadSource, newLeadSourceKey, retryExternalLead, saveExternalForm, saveLeadSourceSettings, sendExternalTestLead, setUpLeadSource } from "../leads/actions"
import { sourceByIntegration } from "../leads/sources"
import { CardButton, IntegrationCard, cardOf } from "./card"

// Google Ads lead forms and Google Forms: the card, and its Configure modal (how to connect, with
// the address and key or the Apps Script; lead settings; each form's campaign, project, owner and
// questions; the latest leads).
//   integrationKey: "google-leads" | "google-forms" · data: leadSourceOverview() + options, or
//   undefined when this person can't open Campaigns or the plan doesn't include it

const LEAD_STATUS = { created: ["green", "New lead"], duplicate: ["blue", "Added to open lead"], failed: ["red", "Failed"], paused: ["amber", "Waiting"], received: ["gray", "Waiting"] }

export function LeadSourceCard({ integrationKey, data }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const def = integrationByKey(integrationKey)
  const src = sourceByIntegration(integrationKey)
  const base = cardOf(def)
  const refresh = () => router.refresh()

  if (!data) return <IntegrationCard {...base} rows={[["Status", "Managed in Campaigns"]]} status={{ tone: "gray", label: "Unavailable" }} actions={<CardButton disabled>Ask an administrator</CardButton>} />

  const setUp = () =>
    startTransition(async () => {
      const r = await toastAction(() => setUpLeadSource(src.key), { loading: "Setting up…", success: `${def.name} is ready. Follow the steps to connect it.` })
      if (r?.ok) {
        refresh()
        setOpen(true)
      }
    })
  const disconnect = async () => {
    if (
      !(await confirm({
        title: `Disconnect ${def.name}?`,
        description: "PropFlow stops accepting its leads (the key stops working). Forms, the leads already in CRM and the log stay.",
        confirmLabel: "Disconnect",
        destructive: true,
        icon: "link-unlink",
      }))
    )
      return
    const r = await toastAction(() => disconnectLeadSource(src.key), { loading: "Disconnecting…", success: `${def.name} disconnected.` })
    if (r?.ok) refresh()
  }

  const forms = data.forms.filter((f) => f.externalId !== "propflow-test")
  const card = !data.configured ? (
    <IntegrationCard
      {...base}
      rows={[["Status", "Not connected"]]}
      status={{ tone: "gray", label: "Inactive" }}
      actions={
        data.canEdit ? (
          <Button className={`w-full text-white ${def.tile} hover:opacity-90`} leftIcon={def.icon} loading={pending} onClick={setUp}>
            Connect {src.short}
          </Button>
        ) : (
          <CardButton disabled>Ask an administrator</CardButton>
        )
      }
    />
  ) : (
    <IntegrationCard
      {...base}
      rows={[
        [
          "Forms",
          forms.length ? (
            <>
              {forms[0].name}
              {forms.length > 1 && <span className="text-muted-foreground"> (+{forms.length - 1} more)</span>}
            </>
          ) : (
            <span className="text-muted-foreground">None yet</span>
          ),
        ],
        ["Last lead", data.stats.lastAt ? timeAgo(data.stats.lastAt) : "Never"],
        ["Leads synced", data.stats.leads.toLocaleString("en-US")],
      ]}
      status={forms.length ? { tone: "green", label: "Connected" } : { tone: "amber", label: "Connected · waiting for the first lead" }}
      actions={
        <>
          <CardButton onClick={() => setOpen(true)}>{data.canEdit ? "Configure" : "View"}</CardButton>
          {data.canEdit && (
            <CardButton className="text-red-600 hover:text-red-600 dark:text-red-400" onClick={disconnect}>
              Disconnect
            </CardButton>
          )}
        </>
      }
    />
  )
  return (
    <>
      {card}
      {open && data.configured && <Configure def={def} src={src} data={data} onClose={() => setOpen(false)} onChanged={refresh} />}
    </>
  )
}

const Heading = ({ id, children, action }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h3 id={id} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
    {action}
  </div>
)

function Copy({ value, label, mono = true, block = false }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className={block ? "relative" : "flex items-center gap-2"}>
      {block ? (
        <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 pr-12 font-mono text-[11px] leading-relaxed whitespace-pre">{value}</pre>
      ) : (
        <code className={`min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
      )}
      <IconButton icon={copied ? "check-line" : "file-copy-line"} variant="outline" tooltip={copied ? "Copied" : `Copy ${label}`} onClick={copy} className={block ? "absolute top-2 right-2" : undefined} />
    </div>
  )
}

function Configure({ def, src, data, onClose, onChanged }) {
  const [pending, startTransition] = useTransition()
  const newKey = async () => {
    if (
      !(await confirm({
        title: "Make a new key?",
        description:
          src.key === "google-ads" ? "The current key stops working. Paste the new one into every Google Ads lead form." : "The current key stops working. Copy the new script into every Google Form that uses it.",
        confirmLabel: "Make new key",
      }))
    )
      return
    const r = await toastAction(() => newLeadSourceKey(src.key), { loading: "Saving…", success: "New key made." })
    if (r?.ok) onChanged()
  }
  const test = () =>
    startTransition(async () => {
      const r = await toastAction(() => sendExternalTestLead(src.key), { loading: "Sending a test lead…", success: (x) => `Test lead ${x.code ?? ""} is in CRM.` })
      if (r?.ok) onChanged()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <span className={`flex size-7 items-center justify-center rounded-lg text-base text-white ${def.tile}`}>
            <Icon name={def.icon} />
          </span>
          {def.name}
        </span>
      }
      description={def.subtitle}
      headerActions={
        data.canEdit ? (
          <Button size="sm" variant="outline" leftIcon="flask-line" loading={pending} onClick={test}>
            Send a test lead
          </Button>
        ) : null
      }
      scrollable
      className="sm:max-w-2xl"
      bodyClassName="space-y-6"
    >
      {data.canEdit && (
        <section aria-labelledby="connect-title" className="space-y-3">
          <Heading
            id="connect-title"
            action={
              <Button size="sm" variant="ghost" leftIcon="refresh-line" onClick={newKey}>
                New key
              </Button>
            }
          >
            How to connect
          </Heading>
          {src.key === "google-ads" ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>In Google Ads, open the campaign&apos;s lead form asset (Assets › Lead forms).</li>
                <li>Under Lead delivery › Webhook integration, paste the address and key below.</li>
                <li>Press Send test data: a test lead shows below within seconds.</li>
              </ol>
              <Copy value={data.url} label="webhook address" />
              <Copy value={data.key} label="key" />
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Open your Google Form, then ⋮ › Script editor (Apps Script).</li>
                <li>Replace everything there with the script below and save.</li>
                <li>Choose “install” at the top and press Run, then allow access. The form shows up below.</li>
              </ol>
              <Copy value={data.script} label="script" block />
              <p className="text-xs text-muted-foreground">Use the same script in every form. Ask for a name and a mobile number, so each response can become a lead.</p>
            </>
          )}
        </section>
      )}
      {data.canEdit && <LeadDefaults src={src} data={data} onChanged={onChanged} />}
      <Forms src={src} data={data} onChanged={onChanged} />
      <LeadLog src={src} data={data} onChanged={onChanged} />
    </Dialog>
  )
}

function LeadDefaults({ src, data, onChanged }) {
  const [draft, setDraft] = useState(data.settings)
  const [pending, startTransition] = useTransition()
  const save = (patch, success = "Lead settings saved.") => {
    const before = draft
    setDraft((d) => ({ ...d, ...patch }))
    startTransition(async () => {
      const r = await toastAction(() => saveLeadSourceSettings(src.key, patch), { loading: "Saving…", success })
      if (r?.error) setDraft(before)
      else onChanged()
    })
  }
  const switches = [
    { key: "notify", label: "Notify on new leads", text: "A bell for whoever gets the lead" },
    { key: "dedupeEmail", label: "Deduplicate by email", text: "The same email counts as the same person, so their open lead gets a note" },
    { key: "noteSource", label: "Note where it came from", text: `“${src.short} · form name” as the lead's first note line` },
  ]
  return (
    <section aria-labelledby="lead-defaults" className="space-y-4">
      <Heading id="lead-defaults">Lead settings</Heading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Default owner for new leads"
          value={draft.owner}
          disabled={pending}
          onChange={(v) => save({ owner: v })}
          options={[{ value: "round-robin", label: "Auto-assign (CRM rules, then round robin)" }, { value: "", label: "Leave unassigned" }, ...data.options.agents]}
        />
        <Select label="Default pipeline stage" value={draft.stage} disabled={pending} onChange={(v) => save({ stage: v })} options={data.options.stages} />
      </div>
      <div className="divide-y rounded-xl border px-4">
        {switches.map((x) => (
          <div key={x.key} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{x.label}</span>
              <span className="block text-muted-foreground">{x.text}</span>
            </span>
            <Switch aria-label={x.label} checked={Boolean(draft[x.key])} disabled={pending} onChange={(on) => save({ [x.key]: on }, `${x.label}: ${on ? "on" : "off"}.`)} />
          </div>
        ))}
      </div>
    </section>
  )
}

function Forms({ src, data, onChanged }) {
  const [editing, setEditing] = useState(null)
  return (
    <section aria-labelledby="forms-title">
      <Heading id="forms-title">Forms</Heading>
      {data.forms.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">
          {src.key === "google-ads" ? "Forms show here with their first lead. Use Send test data in Google Ads to try it." : "Forms show here once the script is installed, or with their first response."}
        </p>
      ) : (
        <ul className="space-y-2">
          {data.forms.map((f) => (
            <li key={f.externalId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5">
              <Icon name="survey-line" className="text-lg text-muted-foreground" />
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {f.name}
                  {f.paused && <Badge color="amber">Paused</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[f.campaign?.name ?? "No campaign", f.project?.name, f.assignTo === "round-robin" ? "CRM assignment rules" : f.assignTo ? "One person" : "Unassigned"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {f.last30.created} new · {f.last30.duplicate} repeat{f.last30.failed ? ` · ${f.last30.failed} failed` : ""}
                {f.lastLeadAt && <span className="block text-right">last {timeAgo(f.lastLeadAt)}</span>}
              </p>
              {data.canEdit && (
                <DropdownMenu
                  align="end"
                  trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${f.name}`} size="sm" />}
                  items={[{ label: "Settings", icon: "settings-3-line", onClick: () => setEditing(f) }]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <FormDialog src={src} form={editing} options={data.options} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </section>
  )
}

function FormDialog({ src, form, options, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    name: form.name,
    campaign: form.campaign?.code ?? "",
    project: form.project?.code ?? "",
    assignTo: form.assignTo ?? "round-robin",
    channel: form.channel ?? "",
    mapping: Object.fromEntries(form.questions.map((q) => [q.key, q.target ?? ""])),
    paused: form.paused,
  })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => saveExternalForm(src.key, form.externalId, { ...draft, campaign: draft.campaign || null, project: draft.project || null, channel: draft.channel || null }), {
        loading: "Saving…",
        success: "Form saved.",
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      if (r?.ok) {
        onSaved()
        onClose()
      }
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={form.name}
      description={`Leads from this ${src.short} form become CRM leads with these details.`}
      scrollable
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="text-sm">
          <span className="block font-medium">Receive leads from this form</span>
          <span className="block text-xs text-muted-foreground">While off, leads wait in the log and can be added later.</span>
        </span>
        <Switch aria-label="Receive leads from this form" checked={!draft.paused} onChange={(on) => set("paused", !on)} />
      </div>
      <Input label="Name in PropFlow" value={draft.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
      {src.key === "google-forms" && <Select label="Lead source" value={draft.channel} onChange={(v) => set("channel", v)} options={[{ value: "", label: "Not set" }, ...options.channels]} error={errors.channel} />}
      <Select label="Campaign" value={draft.campaign} onChange={(v) => set("campaign", v)} options={[{ value: "", label: "No campaign" }, ...options.campaigns]} error={errors.campaign} />
      <Select label="Project" value={draft.project} onChange={(v) => set("project", v)} options={[{ value: "", label: "The campaign's project, or none" }, ...options.projects]} error={errors.project} />
      <Select
        label="Assign new leads to"
        value={draft.assignTo}
        onChange={(v) => set("assignTo", v)}
        options={[{ value: "round-robin", label: "CRM assignment rules, then in turn" }, { value: "", label: "Leave unassigned" }, ...options.agents]}
        error={errors.assignTo}
      />
      {form.standard.length > 0 && <p className="text-sm text-muted-foreground">{form.standard.join(", ")}: filled in on the lead and contact automatically.</p>}
      {form.questions.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Your questions</legend>
          {form.questions.map((q) => (
            <Select key={q.key} label={q.label} value={draft.mapping[q.key] ?? ""} onChange={(v) => set("mapping", { ...draft.mapping, [q.key]: v })} options={options.targets} />
          ))}
        </fieldset>
      )}
    </Dialog>
  )
}

function LeadLog({ src, data, onChanged }) {
  const retry = (l) =>
    toastAction(() => retryExternalLead(src.key, l.id), { loading: "Trying again…", success: (x) => (x.status === "duplicate" ? "Added to the person's open lead." : "Lead added to CRM.") }).then(
      (r) => r?.ok && onChanged(),
    )
  return (
    <section aria-labelledby="log-title">
      <Heading id="log-title">Latest leads</Heading>
      {data.log.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">No leads yet. They show here as they arrive.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {data.log.map((l) => {
            const [color, label] = LEAD_STATUS[l.status] ?? LEAD_STATUS.received
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 basis-48">
                  {l.lead?.code ? (
                    <Link href={`/crm/leads?lead=${urlCode(l.lead.code)}`} className="font-medium hover:underline">
                      {l.lead.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{l.lead?.name ?? l.sentBy ?? "No name given"}</span>
                  )}
                  {l.isTest && (
                    <Badge color="gray" className="ml-2">
                      Test
                    </Badge>
                  )}
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.formName ?? "Form"}
                    {l.error && <span className="text-red-600 dark:text-red-400"> · {l.error}</span>}
                  </span>
                </span>
                <Badge color={color}>{label}</Badge>
                <span className="w-20 text-right text-xs text-muted-foreground">{timeAgo(l.receivedAt)}</span>
                {data.canEdit && ["failed", "paused"].includes(l.status) && (
                  <Button size="sm" variant="outline" onClick={() => retry(l)}>
                    Try again
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
