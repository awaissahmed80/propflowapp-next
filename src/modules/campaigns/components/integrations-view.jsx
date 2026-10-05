"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { integrationByKey } from "@/modules/integrations/catalog"
import { SYNC_OPTIONS } from "../meta/settings"
import { disconnectMeta, saveMetaSettings, refreshPageForms, retryMetaLead, saveMetaForm, sendMetaTestLead, setPageLeads, syncMetaForm } from "../server/meta-actions"

// Campaigns › Integrations: Facebook & Instagram lead ads (connect Facebook, pick the Pages whose
// leads come in, set each lead form up, watch what arrived), and what's coming next.
// Shown in Campaigns › Integrations and Settings › Integrations (every third-party connection).
//   integrations: [{ key, status: live | soon, blocked }] for this workspace (hidden ones left out)
//   meta: metaOverview(), or null when this person can't open Campaigns
//   setup: { webhookUrl, redirectUri } for the server's Meta app · from: "campaigns" | "settings"

// What came back from Facebook Login (?meta=…)
const RESULTS = {
  connected: ["success", "Facebook connected. Switch on the Pages whose leads should come in."],
  "no-pages": ["warning", "Facebook connected, but this account doesn't manage any Pages. Connect with an account that's an admin of your Page."],
  cancelled: ["info", "Facebook connection canceled."],
  expired: ["error", "That took too long or was started elsewhere. Try connecting again."],
  failed: ["error", "Facebook didn't accept the connection. Try again."],
  "missing-permissions": ["error", "Some permissions were turned off in Facebook's dialog. Connect again and keep them all on, or leads can't be read."],
  "not-allowed": ["error", "Your role can't change Campaigns. Ask an administrator."],
  "not-in-plan": ["error", "Lead ads aren't part of this workspace's plan."],
  "not-configured": ["error", "Facebook isn't set up on this server yet."],
  "not-for-staff": ["error", "Facebook can't be connected while signed in as a member."],
  "turned-off": ["error", "PropFlow has switched this integration off for your workspace. Contact support to turn it back on."],
}

const LEAD_STATUS = {
  created: { label: "New lead", color: "green" },
  duplicate: { label: "Added to open lead", color: "blue" },
  failed: { label: "Failed", color: "red" },
  paused: { label: "Form paused", color: "amber" },
  received: { label: "Waiting", color: "gray" },
}

export function IntegrationsView({ integrations = [], meta, setup, from = "campaigns", description = "Connect lead sources and messaging, and keep CRM in sync on its own" }) {
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()
  // Just connected: the configuration opens so the Pages can be switched on
  const [configuring, setConfiguring] = useState(() => params.get("meta") === "connected")

  // Show the Facebook Login result once, then clean the address
  useEffect(() => {
    const result = RESULTS[params.get("meta")]
    if (!result) return
    toast[result[0]](result[1])
    router.replace(pathname, { scroll: false })
  }, [params, pathname, router])

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Integrations" description={description} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map(({ key, status, blocked }) => {
          const def = integrationByKey(key)
          if (!def) return null
          if (status === "soon")
            return <IntegrationCard key={key} {...cardOf(def)} rows={[["Status", "Coming soon"]]} status={{ tone: "gray", label: "Coming soon" }} actions={<CardButton disabled>Coming soon</CardButton>} />
          if (blocked)
            return (
              <IntegrationCard
                key={key}
                {...cardOf(def)}
                rows={[["Status", "Switched off by PropFlow"]]}
                status={{ tone: "red", label: "Switched off" }}
                actions={<CardButton disabled>Ask PropFlow support</CardButton>}
              />
            )
          if (key === "meta") return <MetaCard key={key} meta={meta} from={from} onConfigure={() => setConfiguring(true)} onChanged={() => router.refresh()} />
          return null
        })}
      </div>
      {meta && <MetaConfigure open={configuring} onOpenChange={setConfiguring} meta={meta} setup={setup} from={from} onChanged={() => router.refresh()} />}
    </div>
  )
}

// What a card shows from the catalog (never spread `key` into JSX)
const cardOf = ({ icon, tile, name, subtitle, info }) => ({ icon, tile, name, subtitle, info })

const TONES = {
  green: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  amber: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  red: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  gray: { dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
}

// One integration: logo, name, what it does, a few facts, status, and its buttons
//   rows: [[label, value]] · status: { tone: green | amber | red | gray, label } · actions: buttons
function IntegrationCard({ icon, tile, name, subtitle, info, rows = [], status, actions }) {
  const { dot, text } = TONES[status.tone]
  return (
    <section aria-label={name} className="flex flex-col rounded-xl border bg-background p-5 shadow-xs">
      <header className="flex items-start gap-4">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl text-white", tile)}>
          <Icon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </span>
        {info && <InfoPopover name={name} info={info} />}
      </header>
      <dl className="mt-4 space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-1">
            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
            <dd className="min-w-0 truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("mt-4 flex items-center gap-2 text-sm font-medium", text)}>
        <span aria-hidden className={cn("size-2 rounded-full", dot)} />
        {status.label}
      </p>
      <div className="mt-auto grid auto-cols-fr grid-flow-col gap-3 pt-5">{actions}</div>
    </section>
  )
}

// The (i) button: what the integration does and what you need before connecting
function InfoPopover({ name, info }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`About ${name}`}
            className="-mt-1 -mr-1 cursor-pointer rounded-full p-1 text-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground"
          >
            <Icon name="information-line" />
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-3 text-sm">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
          <PopoverDescription>{info.about}</PopoverDescription>
        </PopoverHeader>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">What you need</p>
          <ul className="space-y-1.5">
            {info.needs.map((n) => (
              <li key={n} className="flex gap-2">
                <Icon name="checkbox-circle-line" className="mt-0.5 shrink-0 text-primary" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const CardButton = ({ className, ...props }) => <Button variant="outline" className={cn("w-full", className)} {...props} />

function MetaCard({ meta, from, onConfigure, onChanged }) {
  const base = cardOf(integrationByKey("meta"))

  // Someone who can't open Campaigns sees it here, managed there
  if (!meta) return <IntegrationCard {...base} rows={[["Status", "Managed in Campaigns"]]} status={{ tone: "gray", label: "No access" }} actions={<CardButton disabled>Ask an administrator</CardButton>} />
  if (!meta.feature) return <IntegrationCard {...base} rows={[["Status", "Not in your plan"]]} status={{ tone: "gray", label: "Unavailable" }} actions={<CardButton disabled>Not in your plan</CardButton>} />
  if (!meta.enabled)
    return (
      <IntegrationCard
        {...base}
        rows={[["Status", "Not set up on this server"]]}
        status={{ tone: "amber", label: "Setup needed" }}
        actions={
          <CardButton leftIcon="tools-line" onClick={onConfigure}>
            How to set up
          </CardButton>
        }
      />
    )

  const { connection, canEdit, pages, stats } = meta
  if (!connection)
    return (
      <IntegrationCard
        {...base}
        rows={[["Status", "Not connected"]]}
        status={{ tone: "gray", label: "Inactive" }}
        actions={
          canEdit ? (
            <Button className="w-full bg-[#0866FF] text-white hover:bg-[#0866FF]/90" leftIcon="facebook-circle-fill" nativeButton={false} render={<a href={`/api/meta/start?from=${from}`} />}>
              Connect Facebook
            </Button>
          ) : (
            <CardButton disabled>Ask an administrator</CardButton>
          )
        }
      />
    )

  const on = pages.filter((p) => p.subscribed)
  const shown = on[0] ?? null
  const broken = pages.some((p) => p.lastError)
  const disconnect = async () => {
    if (
      !(await confirm({
        title: "Disconnect Facebook?",
        description: "Leads stop coming in from every Page. Forms, the leads already in CRM and the log stay. You can connect again any time.",
        confirmLabel: "Disconnect",
        destructive: true,
        icon: "link-unlink",
      }))
    )
      return
    const r = await toastAction(() => disconnectMeta(), { loading: "Disconnecting…", success: "Facebook disconnected." })
    if (r?.ok) onChanged()
  }
  return (
    <IntegrationCard
      {...base}
      rows={[
        [
          "Page",
          shown ? (
            <>
              {shown.name}
              {on.length > 1 && <span className="text-muted-foreground"> (+{on.length - 1} more)</span>}
            </>
          ) : (
            <span className="text-muted-foreground">None switched on yet</span>
          ),
        ],
        ["Last sync", stats.lastAt ? timeAgo(stats.lastAt) : "Never"],
        ["Leads synced", stats.leads.toLocaleString("en-US")],
      ]}
      status={broken ? { tone: "red", label: "Needs attention" } : on.length ? { tone: "green", label: "Connected" } : { tone: "amber", label: "Connected · no Page on" }}
      actions={
        <>
          <CardButton onClick={onConfigure}>{canEdit ? "Configure" : "View"}</CardButton>
          {canEdit && (
            <CardButton className="text-red-600 hover:text-red-600 dark:text-red-400" onClick={disconnect}>
              Disconnect
            </CardButton>
          )}
        </>
      }
    />
  )
}

// How every Facebook lead is added: the extra check for missed leads, who gets leads from forms
// nobody set up, the starting status, and three switches. Each change saves straight away.
function LeadSettings({ meta, onChanged }) {
  const [draft, setDraft] = useState(meta.settings)
  const [pending, startTransition] = useTransition()
  const disabled = !meta.canEdit || pending
  const save = (patch, success = "Lead settings saved.") => {
    const before = draft
    setDraft((d) => ({ ...d, ...patch }))
    startTransition(async () => {
      const r = await toastAction(() => saveMetaSettings(patch), { loading: "Saving…", success })
      if (r?.error) setDraft(before)
      else onChanged()
    })
  }
  const switches = [
    { key: "notify", label: "Notify on new leads", text: "A bell for whoever gets the lead (or whoever connected Facebook, when nobody has it)" },
    { key: "dedupeEmail", label: "Deduplicate by email", text: "The same email counts as the same person, so their open lead gets a note instead of a new lead" },
    { key: "noteSource", label: "Note where it came from", text: "“Facebook lead ad · form name” as the lead's first note line" },
  ]
  return (
    <section aria-labelledby="lead-settings-title" className="space-y-4">
      <h3 id="lead-settings-title" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Lead settings
      </h3>
      <Select label="Sync frequency" value={draft.sync} disabled={disabled} onChange={(v) => save({ sync: v })} options={SYNC_OPTIONS} />
      <Select
        label="Default owner for new leads"
        value={draft.owner}
        disabled={disabled}
        onChange={(v) => save({ owner: v })}
        options={[{ value: "round-robin", label: "Auto-assign (CRM rules, then round robin)" }, { value: "", label: "Leave unassigned" }, ...meta.options.agents]}
      />
      <Select label="Default pipeline stage" value={draft.stage} disabled={disabled} onChange={(v) => save({ stage: v })} options={meta.options.stages} />
      <div className="divide-y rounded-xl border px-4">
        {switches.map((x) => (
          <div key={x.key} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{x.label}</span>
              <span className="block text-muted-foreground">{x.text}</span>
            </span>
            <Switch aria-label={x.label} checked={Boolean(draft[x.key])} disabled={disabled} onChange={(on) => save({ [x.key]: on }, `${x.label}: ${on ? "on" : "off"}.`)} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Each form can still pick its own owner, campaign and project in its settings.</p>
    </section>
  )
}

// Configure Meta (a modal): Pages and their forms, the latest leads, reconnect
function MetaConfigure({ open, onOpenChange, meta, setup, from, onChanged }) {
  const { connection, canEdit } = meta
  const daysLeft = connection?.daysLeft ?? null
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#0866FF] text-base text-white">
            <Icon name="meta-fill" />
          </span>
          Meta lead ads
        </span>
      }
      description={
        connection
          ? `Connected as ${connection.name ?? "a Facebook account"}${daysLeft != null && daysLeft <= 14 ? ` · reconnect within ${Math.max(0, daysLeft)} days to keep the Page list fresh` : ""}`
          : "Facebook & Instagram lead ads into CRM"
      }
      headerActions={
        connection && meta.enabled && canEdit ? (
          <Button size="sm" variant="outline" leftIcon="refresh-line" nativeButton={false} render={<a href={`/api/meta/start?from=${from}`} />}>
            Reconnect
          </Button>
        ) : null
      }
      scrollable
      className="sm:max-w-2xl"
      bodyClassName="space-y-6"
    >
      {!meta.enabled ? (
        <SetupNotice setup={setup} />
      ) : !connection ? (
        <Steps canEdit={canEdit} />
      ) : (
        <>
          <LeadSettings meta={meta} onChanged={onChanged} />
          <section aria-labelledby="pages-title">
            <h3 id="pages-title" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Pages
            </h3>
            {meta.pages.length === 0 ? (
              <Notice icon="information-line">This Facebook account doesn&apos;t manage any Pages. Reconnect with an account that&apos;s an admin of your business Page.</Notice>
            ) : (
              <ul className="divide-y rounded-xl border">
                {meta.pages.map((p) => (
                  <PageRow key={p.pageId} page={p} meta={meta} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </section>
          <LeadLog log={meta.log} canEdit={canEdit} onChanged={onChanged} />
        </>
      )}
    </Dialog>
  )
}

const Notice = ({ icon, children }) => (
  <p className="flex items-start gap-2 px-4 py-4 text-sm text-muted-foreground">
    <Icon name={icon} className="mt-0.5 shrink-0 text-base" />
    <span>{children}</span>
  </p>
)

function Steps({ canEdit }) {
  const steps = ["Connect the Facebook account that manages your business Page", "Switch on the Pages whose lead ads should come in", "Pick each form's campaign, project and who gets its leads"]
  return (
    <div className="px-4 py-4">
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      {!canEdit && <p className="mt-3 text-sm text-muted-foreground">Ask someone who can change Campaigns to connect Facebook.</p>}
    </div>
  )
}

// The server has no Meta app keys yet: what the platform owner sets up
function SetupNotice({ setup }) {
  return (
    <div className="space-y-2 px-4 py-4 text-sm">
      <p className="text-amber-700 dark:text-amber-400">Facebook isn&apos;t set up on this server yet. Whoever runs PropFlow adds a Meta app:</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <code className="text-foreground">META_APP_ID</code>, <code className="text-foreground">META_APP_SECRET</code> and <code className="text-foreground">META_WEBHOOK_VERIFY_TOKEN</code> in the server&apos;s
          environment
        </li>
        <li>
          Facebook Login redirect: <code className="break-all text-foreground">{setup.redirectUri}</code>
        </li>
        <li>
          Page webhook (field <code className="text-foreground">leadgen</code>): <code className="break-all text-foreground">{setup.webhookUrl}</code>
        </li>
      </ul>
    </div>
  )
}

// A Page's profile picture from Facebook's stable address (it redirects to the current image;
// the signed CDN links Facebook hands out expire), or a plain icon if it doesn't load
function PagePicture({ pageId }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon name="pages-line" />
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Facebook's image, already small
    <img
      src={`https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=square&width=72&height=72`}
      alt=""
      className="size-9 shrink-0 rounded-full border bg-muted object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function PageRow({ page, meta, onChanged }) {
  const [on, setOn] = useState(page.subscribed)
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(null)
  const toggle = (next) => {
    setOn(next)
    startTransition(async () => {
      const r = await toastAction(() => setPageLeads(page.pageId, next), {
        loading: next ? "Connecting the Page…" : "Stopping…",
        success: (x) => (next ? `Leads from ${page.name} will come in. ${x.forms} lead ${x.forms === 1 ? "form" : "forms"} found.` : `Leads from ${page.name} stopped.`),
      })
      if (r?.error) setOn(!next)
      else onChanged()
    })
  }
  const refresh = () =>
    toastAction(() => refreshPageForms(page.pageId), { loading: "Checking Facebook for forms…", success: (x) => `${x.forms} lead ${x.forms === 1 ? "form" : "forms"} on ${page.name}.` }).then((r) => r?.ok && onChanged())

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <PagePicture pageId={page.pageId} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{page.name}</p>
          <p className="text-xs text-muted-foreground">{on ? `Receiving leads · ${page.forms.length} lead ${page.forms.length === 1 ? "form" : "forms"}` : "Not receiving leads"}</p>
        </div>
        {on && meta.canEdit && <IconButton icon="refresh-line" aria-label={`Check ${page.name} for new forms`} size="sm" onClick={refresh} />}
        <Switch aria-label={`Receive leads from ${page.name}`} checked={on} disabled={!meta.canEdit || pending} onChange={toggle} />
      </div>
      {page.lastError && (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <Icon name="error-warning-line" className="mt-0.5 shrink-0" />
          {page.lastError}
        </p>
      )}
      {on && page.forms.length > 0 && (
        <ul className="mt-3 space-y-2 sm:pl-12">
          {page.forms.map((f) => (
            <FormRow key={f.formId} form={f} canEdit={meta.canEdit} onEdit={() => setEditing(f)} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {on && page.forms.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground sm:pl-12">No lead forms on this Page yet. Make one in Meta Ads Manager; it shows here when its first lead comes in, or press refresh.</p>
      )}
      {editing && <FormDialog form={editing} options={meta.options} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </li>
  )
}

function FormRow({ form: f, canEdit, onEdit, onChanged }) {
  const sync = () =>
    toastAction(() => syncMetaForm(f.formId), {
      loading: "Fetching leads from Facebook…",
      success: (x) => (x.created ? `${x.created} missed ${x.created === 1 ? "lead" : "leads"} added to CRM.` : x.found ? "Nothing missed: every lead is already in CRM." : "No leads on Facebook since the last check."),
    }).then((r) => r?.ok && onChanged())
  const test = () => toastAction(() => sendMetaTestLead(f.formId), { loading: "Sending a test lead…", success: (x) => `Test lead ${x.code ?? ""} is in CRM.` }).then((r) => r?.ok && onChanged())
  const summary = f.linked
    ? [f.campaign?.name ?? "No campaign", f.project?.name, f.assignTo === "round-robin" ? "CRM assignment rules" : f.assignTo ? "One person" : "Unassigned"].filter(Boolean).join(" · ")
    : "Not set up yet: leads follow your lead settings"

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5">
      <Icon name="survey-line" className="text-lg text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {f.name}
          {f.paused && <Badge color="amber">Paused</Badge>}
          {f.fbStatus && f.fbStatus !== "ACTIVE" && <Badge color="gray">{f.fbStatus.toLowerCase()} on Facebook</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {f.last30.created} new · {f.last30.duplicate} repeat{f.last30.failed ? ` · ${f.last30.failed} failed` : ""} <span className="hidden sm:inline">(30 days)</span>
        {f.lastLeadAt && <span className="block text-right">last {timeAgo(f.lastLeadAt)}</span>}
      </p>
      {canEdit && (
        <DropdownMenu
          align="end"
          trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${f.name}`} size="sm" />}
          items={[
            { label: f.linked ? "Settings" : "Set up", icon: "settings-3-line", onClick: onEdit },
            { label: "Fetch missed leads", icon: "download-cloud-2-line", onClick: sync },
            { label: "Send a test lead", icon: "flask-line", onClick: test },
          ]}
        />
      )}
    </li>
  )
}

// Campaign, project, who gets the leads, and what each custom question fills
function FormDialog({ form, options, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    campaign: form.campaign?.code ?? "",
    project: form.project?.code ?? "",
    assignTo: form.assignTo ?? "round-robin",
    mapping: Object.fromEntries(form.questions.map((q) => [q.key, q.target ?? ""])),
    paused: form.paused,
  })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => saveMetaForm(form.formId, { ...draft, campaign: draft.campaign || null, project: draft.project || null }), { loading: "Saving…", success: "Form saved." })
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
      description="Leads from this Facebook form become CRM leads with these details."
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

function LeadLog({ log, canEdit, onChanged }) {
  const retry = (l) =>
    toastAction(() => retryMetaLead(l.leadgenId), { loading: "Trying again…", success: (x) => (x.status === "duplicate" ? "Added to the person's open lead." : "Lead added to CRM.") }).then((r) => r?.ok && onChanged())
  return (
    <section aria-labelledby="log-title">
      <h3 id="log-title" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Latest leads
      </h3>
      <div className="rounded-xl border">
        {log.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No leads yet. They show here as they arrive. Use “Send a test lead” on a form to try it.</p>
        ) : (
          <ul className="divide-y">
            {log.map((l) => {
              const s = LEAD_STATUS[l.status] ?? LEAD_STATUS.received
              return (
                <li key={l.leadgenId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <Icon name={l.platform === "ig" ? "instagram-line" : "facebook-circle-line"} className="text-lg text-muted-foreground" aria-label={l.platform === "ig" ? "Instagram" : "Facebook"} />
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
                      {l.formName ?? "Unknown form"}
                      {l.error && <span className="text-red-600 dark:text-red-400"> · {l.error}</span>}
                    </span>
                  </span>
                  <Badge color={s.color}>{s.label}</Badge>
                  <span className="w-20 text-right text-xs text-muted-foreground">{timeAgo(l.receivedAt)}</span>
                  {canEdit && ["failed", "paused"].includes(l.status) && (
                    <Button size="sm" variant="outline" onClick={() => retry(l)}>
                      Try again
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
