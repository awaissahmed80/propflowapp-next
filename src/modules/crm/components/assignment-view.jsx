"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { toast } from "sonner"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { Notice } from "@/modules/users/components/user-parts"
import { PageHeader } from "@/components/page-header"
import { PersonPicker } from "@/components/person-picker"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { deleteAssignmentRule, moveAssignmentRule, saveAssignmentRule, saveReassignRule, setAssignmentRuleActive } from "../server/assignment-actions"

// CRM › Customize › Assignment rules: who gets new leads. Rules run top to bottom; the first match wins;
// nothing matches → the workspace's auto-assign (Settings › CRM). Plus: reassign new leads
// nobody has reached within a set number of hours.

const EMPTY = { name: "", conditions: { projects: [], sources: [], cities: [], unitTypes: [], overseas: null, budgetMin: null, budgetMax: null }, assignTo: "team", agentId: null, teamId: null, agentIds: [] }

// Pick several from a list: a button showing what's picked, a checkbox menu to change it
export function MultiPick({ label, options, value, onChange, anyLabel = "Any" }) {
  const picked = options.filter((o) => value.includes(o.value))
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <DropdownMenu
        align="start"
        className="max-h-80 w-64"
        items={[
          ...options.map((o) => ({ type: "checkbox", key: o.value, label: o.label, checked: value.includes(o.value), onCheckedChange: (on) => onChange(on ? [...value, o.value] : value.filter((v) => v !== o.value)) })),
          ...(value.length ? [{ type: "separator" }, { label: "Clear", icon: "close-line", onClick: () => onChange([]) }] : []),
        ]}
        trigger={
          <button
            type="button"
            className="flex h-control w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
          >
            <span className={cn("min-w-0 flex-1 truncate", !picked.length && "text-muted-foreground")}>{picked.length ? picked.map((o) => o.label).join(", ") : anyLabel}</span>
            <Icon name="arrow-down-s-line" className="text-muted-foreground" />
          </button>
        }
      />
    </div>
  )
}

// "Project is Skyline · Source is Facebook or Website · Budget Rs 50 Lac – 1 Cr"
function useConditionText() {
  const sources = useList("lead-source")
  const types = useList("unit-type")
  const cities = useList("city")
  return (c, projects) => {
    const names = (list, label) => list.map(label).join(" or ")
    const parts = [
      c.projects.length && `Project is ${names(c.projects, (p) => projects.find((x) => x.code === p)?.name ?? p)}`,
      c.sources.length && `Source is ${names(c.sources, sources.label)}`,
      c.cities.length && `City is ${names(c.cities, (v) => cities.label(v) ?? v)}`,
      c.overseas === true && "Overseas",
      c.overseas === false && "In Pakistan",
      c.unitTypes.length && `Looking for ${names(c.unitTypes, (v) => types.label(v).toLowerCase())}`,
      (c.budgetMin != null || c.budgetMax != null) &&
        `Budget ${c.budgetMin != null && c.budgetMax != null ? `${formatPkr(c.budgetMin)} – ${formatPkr(c.budgetMax).replace("Rs ", "")}` : c.budgetMin != null ? `from ${formatPkr(c.budgetMin)}` : `up to ${formatPkr(c.budgetMax)}`}`,
    ].filter(Boolean)
    return parts.length ? parts : ["Every new lead"]
  }
}

export function assigneeText(rule, agents, teams) {
  const name = (id) => agents.find((a) => a.id === id)?.name ?? "someone no longer active"
  if (rule.assignTo === "agent") return { icon: "user-line", text: name(rule.agentId) }
  if (rule.assignTo === "team") return { icon: "team-line", text: `Take turns in ${teams.find((t) => t.id === rule.teamId)?.name ?? "a removed team"}` }
  return { icon: "shuffle-line", text: `Take turns: ${rule.agentIds.map(name).join(", ")}` }
}

function RuleDialog({ rule, agents, teams, projects, me, onClose, onSaved }) {
  const sources = useList("lead-source")
  const types = useList("unit-type")
  const cities = useList("city")
  const [form, setForm] = useState(() => (rule ? { ...rule, conditions: { ...rule.conditions } } : EMPTY))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const cond = (patch) => setForm((f) => ({ ...f, conditions: { ...f.conditions, ...patch } }))
  const save = () =>
    startTransition(async () => {
      setError("")
      setErrors({})
      const r = await saveAssignmentRule(form, rule?.id ?? null)
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else onSaved(rule ? "Rule saved." : "Rule added. New leads that match go through it.")
    })
  const c = form.conditions
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title={rule ? "Edit rule" : "New assignment rule"}
      description="When a new lead matches every condition, it goes to the people below. Leave a condition empty to match anything."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={save}>
            {rule ? "Save rule" : "Add rule"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Rule name" required placeholder="e.g. Skyline Facebook leads" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="filter-3-line" className="text-muted-foreground" /> When a new lead…
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <MultiPick label="Project" options={projects.map((p) => ({ value: p.code, label: p.name }))} value={c.projects} onChange={(v) => cond({ projects: v })} anyLabel="Any project" />
            <MultiPick label="Source" options={sources.options} value={c.sources} onChange={(v) => cond({ sources: v })} anyLabel="Any source" />
            <MultiPick label="City" options={cities.options} value={c.cities} onChange={(v) => cond({ cities: v })} anyLabel="Any city" />
            <MultiPick label="Looking for" options={types.options} value={c.unitTypes} onChange={(v) => cond({ unitTypes: v })} anyLabel="Any unit type" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Where they live</p>
              <ToggleGroup
                aria-label="Where they live"
                value={c.overseas === true ? "overseas" : c.overseas === false ? "local" : "any"}
                onChange={(v) => v && cond({ overseas: v === "overseas" ? true : v === "local" ? false : null })}
                options={[
                  { value: "any", label: "Anywhere" },
                  { value: "local", label: "Pakistan" },
                  { value: "overseas", label: "Overseas" },
                ]}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Budget</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput aria-label="Budget from" prefix="Rs" placeholder="From" min={0} value={c.budgetMin} onChange={(v) => cond({ budgetMin: v ?? null })} />
                <NumberInput aria-label="Budget up to" prefix="Rs" placeholder="Up to" min={0} value={c.budgetMax} onChange={(v) => cond({ budgetMax: v ?? null })} />
              </div>
              {errors.budget && <p className="text-xs text-destructive">{errors.budget}</p>}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="user-shared-line" className="text-muted-foreground" /> …give it to
          </h3>
          <ToggleGroup
            aria-label="Give it to"
            value={form.assignTo}
            onChange={(v) => v && set({ assignTo: v })}
            options={[
              { value: "team", label: "A team, taking turns", icon: "team-line" },
              { value: "agents", label: "Chosen agents, taking turns", icon: "shuffle-line" },
              { value: "agent", label: "One agent", icon: "user-line" },
            ]}
          />
          {form.assignTo === "agent" && (
            <div className="space-y-1">
              <PersonPicker aria-label="Agent" people={agents} me={me} allowNone={false} value={form.agentId} onChange={(id) => set({ agentId: id })} />
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
                options={teams.map((t) => ({ value: String(t.id), label: `${t.name} · ${t.agents} ${t.agents === 1 ? "agent" : "agents"}` }))}
                error={errors.teamId}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No teams yet. Create them in Users &amp; Teams, or pick agents instead.</p>
            ))}
          {form.assignTo === "agents" && (
            <div className="space-y-1">
              <MultiPick
                label="Agents"
                options={agents.map((a) => ({ value: String(a.id), label: a.team ? `${a.name} · ${a.team}` : a.name }))}
                value={form.agentIds.map(String)}
                onChange={(v) => set({ agentIds: v.map(Number) })}
                anyLabel="Pick two or more"
              />
              {errors.agentIds && <p className="text-xs text-destructive">{errors.agentIds}</p>}
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">Taking turns skips people who are suspended. Someone picking an agent by hand when adding a lead always wins over the rules.</p>
        </section>
      </div>
    </Dialog>
  )
}

export function AssignmentView({ rules, agents, teams, projects, settings, me }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(null) // a rule, or "new"
  const { confirm } = useAlert()
  const [reassign, setReassign] = useState({ reassign: settings.reassign, hours: settings.reassignHours })
  const [hoursError, setHoursError] = useState("")
  const conditionText = useConditionText()

  // ok: the success toast, if any; errors show as a toast too
  const run = (fn, ok, loading = "Saving…") =>
    startTransition(async () => {
      await toastAction(fn, { loading, success: ok })
      router.refresh()
    })
  const remove = async (r) => {
    if (!(await confirm({ title: `Delete the rule “${r.name}”?`, description: "Leads it already gave out keep their agent; new leads go to the next rule that matches.", confirmLabel: "Delete rule", destructive: true })))
      return
    run(() => deleteAssignmentRule(r.id), "Rule deleted.", "Deleting…")
  }
  const saveReassign = (next) => {
    setReassign(next)
    setHoursError("")
    startTransition(async () => {
      const r = await toastAction(() => saveReassignRule(next), { loading: "Saving…" })
      if (r.fieldErrors) setHoursError(r.fieldErrors.hours ?? "Check the hours.")
      else if (!r.error) router.refresh()
    })
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Assignment rules"
        description="Who gets new leads: by project, source, city, unit type or budget"
        actions={
          <Button leftIcon="add-line" onClick={() => setEditing("new")}>
            New rule
          </Button>
        }
      />

      <section className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Icon name="information-line" className="mt-0.5 shrink-0" />
          New leads where nobody picked an agent go through these rules from the top. The first rule that matches decides who gets the lead.
        </p>
        <ol className="divide-y rounded-xl border bg-background shadow-xs">
          {rules.map((r, i) => {
            const who = assigneeText(r, agents, teams)
            const next = r.assignTo !== "agent" ? agents.find((a) => a.id === r.lastAssignedId) : null
            return (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5", !r.active && "opacity-60")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">
                    {r.name}
                    {!r.active && <span className="ml-2 text-xs font-normal text-muted-foreground">Off</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {conditionText(r.conditions, projects).map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <Icon name="arrow-right-line" className="hidden text-muted-foreground sm:block" />
                <div className="min-w-0 basis-56 text-sm">
                  <p className="flex items-center gap-1.5">
                    <Icon name={who.icon} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{who.text}</span>
                  </p>
                  {next && <p className="mt-0.5 truncate text-xs text-muted-foreground">Last given to {next.name}</p>}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Switch aria-label={`${r.name} on`} checked={r.active} disabled={pending} onChange={(on) => run(() => setAssignmentRuleActive(r.id, on))} />
                  <DropdownMenu
                    align="end"
                    items={[
                      { label: "Edit", icon: "edit-line", onClick: () => setEditing(r) },
                      { label: "Move up", icon: "arrow-up-line", disabled: i === 0, onClick: () => run(() => moveAssignmentRule(r.id, -1)) },
                      { label: "Move down", icon: "arrow-down-line", disabled: i === rules.length - 1, onClick: () => run(() => moveAssignmentRule(r.id, 1)) },
                      { type: "separator" },
                      { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => remove(r) },
                    ]}
                    trigger={<IconButton icon="more-2-line" aria-label="Rule actions" tooltip={false} />}
                  />
                </div>
              </li>
            )
          })}
          {/* What happens to everything else */}
          <li className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-muted/30 px-4 py-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon name="more-line" />
            </span>
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium">{rules.length ? "Everything else" : "Every new lead"}</p>
              <p className="text-xs text-muted-foreground">
                Set in{" "}
                <Link href="/crm/customize/pipeline" className="text-primary hover:underline">
                  CRM settings
                </Link>{" "}
                (Auto-assign new leads)
              </p>
            </div>
            <Icon name="arrow-right-line" className="hidden text-muted-foreground sm:block" />
            <p className="flex min-w-0 basis-56 items-center gap-1.5 text-sm">
              <Icon name={settings.autoAssign ? "shuffle-line" : "user-line"} className="shrink-0 text-muted-foreground" />
              {settings.autoAssign ? "Take turns: every active agent" : "Stays with whoever adds it"}
            </p>
            <span className="ml-auto w-[4.75rem]" />
          </li>
        </ol>
        {!rules.length && <p className="text-sm text-muted-foreground">No rules yet. Add one to send, say, a project&apos;s Facebook leads to its sales team.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Leads nobody reached</h2>
        <div className="mt-3 rounded-xl border bg-background px-5 py-4 shadow-xs">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
              <Icon name="timer-flash-line" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Give new leads to someone else if nobody reaches them in time</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                A lead still New, with no call, message or visit that got through, goes to the next agent by these rules (or by taking turns). Only once per lead; its follow-ups go with it, and its history notes the
                move.
              </p>
            </div>
            <Switch aria-label="Reassign leads nobody reached" checked={reassign.reassign} disabled={pending} onChange={(on) => saveReassign({ ...reassign, reassign: on })} />
          </div>
          {reassign.reassign && (
            <div className="mt-3 w-44 pl-13">
              <NumberInput
                label="After"
                suffix="hours"
                min={1}
                max={72}
                disabled={pending}
                value={reassign.hours}
                onChange={(v) => setReassign((x) => ({ ...x, hours: v }))}
                onValueCommitted={(n) => (n && n !== settings.reassignHours ? saveReassign({ ...reassign, hours: n }) : null)}
                error={hoursError || undefined}
              />
            </div>
          )}
        </div>
      </section>

      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          agents={agents}
          teams={teams}
          projects={projects}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null)
            toast.success(text)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
