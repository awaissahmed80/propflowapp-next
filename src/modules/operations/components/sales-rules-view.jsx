"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { PersonPicker } from "@/components/person-picker"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { MultiPick, assigneeText } from "@/modules/crm/components/assignment-view"
import { deleteSalesRule, moveSalesRule, saveSalesRule, setSalesRuleActive } from "../server/setup-actions"

// Sales › Customize › Assignment rules: who handles a booking from each stage on. The agent who
// sold it handles Token and Booking & KYC; rules hand it on, e.g. Active bookings to the recovery
// team, Handover to the possession desk. The seller keeps following it (notes, files, credit).

const STAGES = ["token", "booking-kyc", "active", "handover", "completed"]
const EMPTY = { name: "", stage: "active", conditions: { projects: [], kinds: [] }, assignTo: "team", agentId: null, teamId: null, agentIds: [] }
// Starting points most developers use
const TEMPLATES = [
  { name: "Installments to recovery", stage: "active", icon: "wallet-3-line", text: "Once a booking is Active, the recovery team chases its installments" },
  { name: "Handover to possession desk", stage: "handover", icon: "key-2-line", text: "Paid-up bookings go to the team that issues NDC and gives possession" },
]

function RuleDialog({ rule, agents, teams, projects, me, onClose, onSaved }) {
  const stages = useList("booking-stage")
  const [form, setForm] = useState(() => (rule?.id ? { ...rule, conditions: { ...rule.conditions } } : { ...EMPTY, ...rule, conditions: { ...EMPTY.conditions } }))
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const cond = (patch) => setForm((f) => ({ ...f, conditions: { ...f.conditions, ...patch } }))
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => saveSalesRule(form, rule?.id ?? null), { loading: "Saving rule…", success: rule?.id ? "Rule saved." : "Rule added." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (!r?.error) onSaved()
    })
  const c = form.conditions
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={rule?.id ? "Edit rule" : "New assignment rule"}
      description="When a booking reaches the stage below (and matches the conditions), it's handed to these people."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={save}>
            {rule?.id ? "Save rule" : "Add rule"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Input label="Rule name" required placeholder="e.g. Installments to recovery" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="flag-line" className="text-muted-foreground" /> When a booking reaches…
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Stage" value={form.stage} onChange={(v) => set({ stage: v })} options={STAGES.map((s) => ({ value: s, label: stages.label(s) }))} error={errors.stage} />
            <MultiPick label="Project" options={projects.map((p) => ({ value: p.code, label: p.name }))} value={c.projects} onChange={(v) => cond({ projects: v })} anyLabel="Any project" />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="user-shared-line" className="text-muted-foreground" /> …hand it to
          </h3>
          <ToggleGroup
            aria-label="Hand it to"
            value={form.assignTo}
            onChange={(v) => v && set({ assignTo: v })}
            options={[
              { value: "team", label: "A team, taking turns", icon: "team-line" },
              { value: "agents", label: "Chosen people, taking turns", icon: "shuffle-line" },
              { value: "agent", label: "One person", icon: "user-line" },
            ]}
          />
          {form.assignTo === "agent" && (
            <div className="space-y-1">
              <PersonPicker aria-label="Person" people={agents} me={me} allowNone={false} value={form.agentId} onChange={(id) => set({ agentId: id })} />
              {errors.agentId && <p className="text-xs text-destructive">{errors.agentId}</p>}
            </div>
          )}
          {form.assignTo === "team" &&
            (teams.length ? (
              <Select
                aria-label="Team"
                placeholder="Pick a team"
                value={form.teamId ? String(form.teamId) : ""}
                onChange={(v) => set({ teamId: Number(v) })}
                options={teams.map((t) => ({ value: String(t.id), label: `${t.name} · ${t.agents} ${t.agents === 1 ? "person" : "people"}` }))}
                error={errors.teamId}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No teams yet. Create a recovery or possession team in Users &amp; Teams, or pick people instead.</p>
            ))}
          {form.assignTo === "agents" && (
            <div className="space-y-1">
              <MultiPick
                label="People"
                options={agents.map((a) => ({ value: String(a.id), label: a.team ? `${a.name} · ${a.team}` : a.name }))}
                value={form.agentIds.map(String)}
                onChange={(v) => set({ agentIds: v.map(Number) })}
                anyLabel="Pick two or more"
              />
              {errors.agentIds && <p className="text-xs text-destructive">{errors.agentIds}</p>}
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">The agent who sold it keeps following the booking (notes, files and their commission). Taking turns skips people who are suspended.</p>
        </section>
      </div>
    </Dialog>
  )
}

export function SalesRulesView({ rules, agents, teams, projects, me }) {
  const router = useRouter()
  const stages = useList("booking-stage")
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(null) // a rule, a template, or "new"
  const { confirm } = useAlert()
  const run = (fn, success, loading = "Saving…") =>
    startTransition(async () => {
      await toastAction(fn, { loading, success })
      router.refresh()
    })
  const remove = async (r) => {
    if (!(await confirm({ title: `Delete the rule “${r.name}”?`, description: "Bookings already handed on stay with whoever has them. This can't be undone.", confirmLabel: "Delete rule", destructive: true }))) return
    run(() => deleteSalesRule(r.id), "Rule deleted.", "Deleting…")
  }
  const projectText = (codes) => (codes.length ? codes.map((c) => projects.find((p) => p.code === c)?.name ?? c).join(", ") : "Any project")

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Assignment rules"
        description="Who handles a booking from each stage on. Until a rule hands it on, the agent who sold it handles it."
        actions={
          <Button leftIcon="add-line" onClick={() => setEditing("new")}>
            New rule
          </Button>
        }
      />

      {rules.length > 0 && (
        <ol className="divide-y rounded-xl border bg-background shadow-xs">
          {rules.map((r, i) => {
            const who = assigneeText(r, agents, teams)
            return (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", !r.active && "opacity-60")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">
                    {r.name}
                    {!r.active && <span className="ml-2 text-xs font-normal text-muted-foreground">Off</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Reaches <span className="font-medium text-foreground">{stages.label(r.stage)}</span> · {projectText(r.conditions.projects)}
                  </p>
                </div>
                <Icon name="arrow-right-line" className="hidden text-muted-foreground sm:block" />
                <p className="flex min-w-0 basis-56 items-center gap-1.5 text-sm">
                  <Icon name={who.icon} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{who.text}</span>
                </p>
                <div className="ml-auto flex items-center gap-1">
                  <Switch aria-label={`${r.name} on`} checked={r.active} disabled={pending} onChange={(on) => run(() => setSalesRuleActive(r.id, on), on ? "Rule on." : "Rule off.")} />
                  <DropdownMenu
                    align="end"
                    items={[
                      { label: "Edit", icon: "edit-line", onClick: () => setEditing(r) },
                      { label: "Move up", icon: "arrow-up-line", disabled: i === 0, onClick: () => run(() => moveSalesRule(r.id, -1)) },
                      { label: "Move down", icon: "arrow-down-line", disabled: i === rules.length - 1, onClick: () => run(() => moveSalesRule(r.id, 1)) },
                      { type: "separator" },
                      { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => remove(r) },
                    ]}
                    trigger={<IconButton icon="more-2-line" aria-label="Rule actions" tooltip={false} />}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* Starting points (shown until the workspace has rules for these stages) */}
      {TEMPLATES.some((t) => !rules.some((r) => r.stage === t.stage)) && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{rules.length ? "Also common" : "Start with one of these"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATES.filter((t) => !rules.some((r) => r.stage === t.stage)).map((t) => (
              <button
                key={t.stage}
                type="button"
                onClick={() => setEditing({ name: t.name, stage: t.stage })}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
                  <Icon name={t.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{t.name}</span>
                  <span className="block text-sm text-muted-foreground">{t.text}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Icon name="information-line" className="mt-0.5 shrink-0" />
        Rules run when a booking reaches a stage; the first active rule that matches decides. Managers can still hand a booking to someone by hand from its header.
      </p>

      {editing && <RuleDialog rule={editing === "new" ? null : editing} agents={agents} teams={teams} projects={projects} me={me} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), router.refresh())} />}
    </div>
  )
}
