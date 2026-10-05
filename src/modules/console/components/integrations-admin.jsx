"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { cn } from "@/lib/utils"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { INTEGRATION_STATUS, integrationByKey } from "@/modules/integrations/catalog"
import { disconnectWorkspaceLeadSource, disconnectWorkspaceMeta, disconnectWorkspaceSms, setIntegrationStatus, setWorkspaceIntegration } from "../server/integration-actions"

// Integrations in the console: the platform list (Console › Integrations) and one workspace's
// (Console › Workspaces › a workspace). rows come from server/integrations.js.

const Logo = ({ def, size = "size-11 text-2xl" }) => (
  <span className={cn("flex shrink-0 items-center justify-center rounded-xl text-white", def.tile, size)}>
    <Icon name={def.icon} />
  </span>
)

// Live / Coming soon / Hidden; Live only for built integrations
function StatusPicker({ row, disabled }) {
  const router = useRouter()
  const [value, setValue] = useState(row.status)
  const [pending, startTransition] = useTransition()
  const def = integrationByKey(row.key)
  const pick = (status) => {
    if (status === value) return
    const before = value
    setValue(status)
    startTransition(async () => {
      const r = await toastAction(() => setIntegrationStatus(row.key, status), { loading: "Saving…", success: `${def.name}: ${INTEGRATION_STATUS[status].label}.` })
      if (r?.error) setValue(before)
      else router.refresh()
    })
  }
  return (
    <div role="radiogroup" aria-label={`${def.name} status`} className="inline-flex rounded-full border p-1 text-sm">
      {Object.entries(INTEGRATION_STATUS).map(([key, s]) => {
        const off = disabled || pending || (key === "live" && !row.built)
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            disabled={off}
            title={key === "live" && !row.built ? "Not built yet" : undefined}
            onClick={() => pick(key)}
            className={cn(
              "h-8 rounded-full px-3 font-medium",
              value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              off && value !== key && "cursor-not-allowed opacity-50",
            )}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// Console › Integrations
export function PlatformIntegrations({ rows, editable }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Integrations" description="What workspaces see on their Integrations page: live, coming soon, or hidden. Switch one off for a single workspace from its page." />
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => {
          const def = integrationByKey(row.key)
          return (
            <section key={row.key} aria-label={def.name} className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-xs">
              <header className="flex items-start gap-4">
                <Logo def={def} />
                <span className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {def.name}
                    <Badge color={INTEGRATION_STATUS[row.status].color}>{INTEGRATION_STATUS[row.status].label}</Badge>
                    {!row.built && <Badge color="gray">Not built yet</Badge>}
                  </h2>
                  <p className="text-sm text-muted-foreground">{def.subtitle}</p>
                </span>
              </header>
              <StatusPicker row={row} disabled={!editable} />
              <dl className="grid gap-1.5 text-sm">
                {row.configured != null && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Server keys:</dt>
                    <dd className={row.configured ? "text-green-600 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>{row.configured ? "Set" : "Missing (add them to the server's environment)"}</dd>
                  </div>
                )}
                {row.built && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">In use:</dt>
                    <dd>
                      {row.inUse} {row.inUse === 1 ? "workspace" : "workspaces"}
                    </dd>
                  </div>
                )}
                {row.switchedOff > 0 && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Switched off for:</dt>
                    <dd>
                      {row.switchedOff} {row.switchedOff === 1 ? "workspace" : "workspaces"}
                    </dd>
                  </div>
                )}
                {row.updatedAt && (
                  <div className="flex gap-1">
                    <dt className="text-muted-foreground">Changed:</dt>
                    <dd>{formatDate(row.updatedAt)}</dd>
                  </div>
                )}
              </dl>
              {row.setup && (
                <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
                  <p className="font-medium text-foreground">Register in the Meta app</p>
                  <p className="text-muted-foreground">
                    Facebook Login redirect: <code className="break-all text-foreground">{row.setup.redirectUri}</code>
                  </p>
                  <p className="text-muted-foreground">
                    Page webhook (<code className="text-foreground">leadgen</code>): <code className="break-all text-foreground">{row.setup.webhookUrl}</code>
                  </p>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// Console › Workspaces › a workspace › Integrations
export function WorkspaceIntegrations({ tenantId, rows, editable }) {
  const router = useRouter()
  const [switching, setSwitching] = useState(null) // the integration being switched off
  const turnOn = (row) =>
    toastAction(() => setWorkspaceIntegration(tenantId, row.key, true), { loading: "Switching on…", success: `${integrationByKey(row.key).name} switched back on.` }).then((r) => r?.ok && router.refresh())
  // What disconnecting does, per integration
  const DISCONNECT = {
    meta: {
      title: "Disconnect this workspace's Facebook?",
      description: "Its Pages stop sending lead ads to PropFlow. Its forms, leads and log stay; someone in the workspace can connect again (unless Meta is switched off for it).",
      run: disconnectWorkspaceMeta,
      done: "Facebook disconnected.",
    },
    sms: {
      title: "Disconnect this workspace's SMS gateway?",
      description: "PropFlow stops sending SMS for it. Its provider account and message log stay; someone in the workspace can connect again (unless SMS is switched off for it).",
      run: disconnectWorkspaceSms,
      done: "SMS gateway disconnected.",
    },
  }
  const disconnect = async (key) => {
    const d = DISCONNECT[key] ?? {
      title: `Disconnect this workspace's ${integrationByKey(key).name}?`,
      description: "PropFlow stops accepting its leads (its key stops working). Its forms, leads and log stay; someone in the workspace can connect again (unless it's switched off for it).",
      run: (id) => disconnectWorkspaceLeadSource(id, key),
      done: `${integrationByKey(key).name} disconnected.`,
    }
    if (!(await confirm({ title: d.title, description: d.description, confirmLabel: "Disconnect", destructive: true, icon: "link-unlink" }))) return
    const r = await toastAction(() => d.run(tenantId), { loading: "Disconnecting…", success: d.done })
    if (r?.ok) router.refresh()
  }

  return (
    <>
      <ul className="divide-y">
        {rows.map((row) => {
          const def = integrationByKey(row.key)
          const m = row.meta
          return (
            <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <Logo def={def} size="size-9 text-lg" />
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {def.name}
                  {row.status !== "live" && <Badge color={INTEGRATION_STATUS[row.status].color}>{INTEGRATION_STATUS[row.status].label}</Badge>}
                  {!row.enabled && <Badge color="red">Switched off</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!row.enabled && row.note
                    ? `Why: ${row.note}`
                    : row.key === "meta"
                      ? m
                        ? `${m.account ?? "Connected"} · ${m.pagesOn.length ? `${m.pagesOn.join(", ")}` : "no Page receiving leads"} · ${m.leads} ${m.leads === 1 ? "lead" : "leads"}${m.lastAt ? `, last ${timeAgo(m.lastAt)}` : ""}`
                        : "Not connected"
                      : "source" in row && row.status === "live"
                        ? row.source
                          ? `${row.source.forms} ${row.source.forms === 1 ? "form" : "forms"} · ${row.source.leads30} ${row.source.leads30 === 1 ? "lead" : "leads"} in 30 days`
                          : "Not connected"
                        : row.key === "sms" && row.status === "live"
                          ? row.sms
                            ? `${row.sms.provider}${row.sms.sender ? ` · ${row.sms.sender}` : ""} · ${row.sms.sent30} SMS in 30 days${row.sms.tested ? "" : " · not tested yet"}`
                            : "Not connected"
                          : def.subtitle}
                </p>
                {m?.error && <p className="text-xs text-red-600 dark:text-red-400">{m.error}</p>}
              </div>
              {editable && (m || row.sms || row.source) && (
                <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" onClick={() => disconnect(row.key)}>
                  Disconnect
                </Button>
              )}
              <Switch aria-label={`Allow ${def.name} for this workspace`} checked={row.enabled} disabled={!editable} onChange={(on) => (on ? turnOn(row) : setSwitching(row))} />
            </li>
          )
        })}
      </ul>
      {switching && <SwitchOffDialog tenantId={tenantId} row={switching} onClose={() => setSwitching(null)} onDone={() => router.refresh()} />}
    </>
  )
}

function SwitchOffDialog({ tenantId, row, onClose, onDone }) {
  const def = integrationByKey(row.key)
  const [note, setNote] = useState("")
  const [pending, startTransition] = useTransition()
  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => setWorkspaceIntegration(tenantId, row.key, false, note), { loading: "Switching off…", success: `${def.name} switched off for this workspace.` })
      if (r?.ok) {
        onDone()
        onClose()
      }
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Switch ${def.name} off for this workspace?`}
      description={
        row.key === "meta" ? "They can't connect or change it. Leads Facebook sends meanwhile wait in their log and can be added once it's back on." : "They won't be able to use it until it's switched back on."
      }
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} disabled={note.trim().length < 5} onClick={save}>
            Switch off
          </Button>
        </>
      }
    >
      <Textarea label="Why" placeholder="e.g. Spam leads reported by Meta, ticket SR-1042" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} required />
    </Dialog>
  )
}
