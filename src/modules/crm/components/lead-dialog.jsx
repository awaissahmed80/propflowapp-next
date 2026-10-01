"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Notice } from "@/modules/users/components/user-parts"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { PersonPicker } from "@/components/person-picker"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { FOLLOW_UP_PRESETS, OPEN_STEPS, OUTCOMES, PAYMENT_PLANS, PURPOSES, budgetText, interestText, outcomeLabel } from "../constants"
import { assignLeads, loadLead, logLeadActivity, planLeadActivity, setLeadPriority, setLeadStatus, updatePlannedActivity } from "../server/leads"
import { LeadForm } from "./lead-form"
import { AgentChip, LeadStatusBadge, TempIcon, TempPicker, dueText, telHref, whatsappHref } from "./lead-parts"

// New → Contacted → … → Negotiation; click a step to move the lead there
function Stepper({ status, canEdit, onPick }) {
  const statuses = useList("lead-status")
  const at = OPEN_STEPS.indexOf(status)
  return (
    <ol className="flex w-full overflow-hidden rounded-lg border text-xs font-medium">
      {OPEN_STEPS.map((st, i) => {
        const done = i < at
        const current = i === at
        const color = toHex(statuses.map[st]?.color) ?? "#64748b"
        return (
          <li key={st} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!canEdit || current}
              onClick={() => onPick(st)}
              className={cn("flex h-9 w-full items-center justify-center gap-1.5 truncate border-r px-2 transition-colors last:border-r-0 enabled:cursor-pointer enabled:hover:bg-muted", current ? "text-white" : done ? "bg-muted/60 text-foreground" : "text-muted-foreground")}
              style={current ? { backgroundColor: color } : undefined}
              title={statuses.label(st)}
            >
              {done && <Icon name="check-line" className="shrink-0" />}
              <span className="truncate">{statuses.label(st)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// "How did it go?": one tap for the outcome, an optional note, and when to follow up next
function OutcomeCard({ title, type, types, showType, onType, pending, onSave, onCancel }) {
  const [outcome, setOutcome] = useState("")
  const [notes, setNotes] = useState("")
  const [next, setNext] = useState("tomorrow")
  const pick = (o) => {
    setOutcome(o)
    // Not interested: usually no follow-up (they're offered "Mark as lost" next)
    setNext(o === "not-interested" ? "" : (n) => n || "tomorrow")
  }
  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {showType && <ToggleGroup value={type} onChange={(v) => v && onType(v)} options={types} />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={outcome === o.value}
            onClick={() => pick(o.value)}
            className={cn("flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2.5 text-sm font-medium transition", outcome === o.value ? "border-primary ring-1 ring-primary" : "hover:border-primary/40")}
          >
            <Icon name={o.icon} className={cn("text-base", o.tone)} /> {o.label}
          </button>
        ))}
      </div>
      <Textarea aria-label="Note" rows={2} placeholder="Note (optional): what they said, what they want next" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Follow up</span>
        <ToggleGroup value={next} onChange={(v) => setNext(v ?? "")} options={[...FOLLOW_UP_PRESETS, { value: "", label: "No follow-up" }]} />
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} disabled={!outcome} onClick={() => onSave({ outcome, notes, next })}>
            Save
          </Button>
        </div>
      </div>
    </section>
  )
}

// Plan a follow-up or site visit for a chosen day
function PlanCard({ lead, projects, pending, onSave, onCancel }) {
  const types = useList("activity-type")
  const [type, setType] = useState("call")
  const [day, setDay] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [time, setTime] = useState("11:00")
  const [projectCode, setProjectCode] = useState(lead.interest.project?.code ?? "")
  const [notes, setNotes] = useState("")
  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="font-semibold">Plan a follow-up</h3>
      <ToggleGroup value={type} onChange={(v) => v && setType(v)} options={types.options.map((t) => ({ value: t.value, label: t.label, icon: types.map[t.value]?.icon }))} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
        <DatePicker label="Day" clearable={false} value={day} onChange={(v) => v && setDay(v)} />
        <Select
          label="Time"
          value={time}
          onChange={setTime}
          options={Array.from({ length: 25 }, (_, i) => {
            const h = 9 + Math.floor(i / 2)
            const m = i % 2 ? "30" : "00"
            return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "AM" : "PM"}` }
          }).filter((o) => o.value <= "21:00")}
        />
        {type === "site-visit" && <Select label="Project" value={projectCode} onChange={setProjectCode} options={projects.map((p) => ({ value: p.code, label: p.name }))} />}
      </div>
      <Textarea aria-label="Note" rows={2} placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button leftIcon="calendar-check-line" loading={pending} onClick={() => onSave({ type, at: `${day}T${time}`, projectCode, notes })}>
          Plan it
        </Button>
      </div>
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

// One entry on the timeline
function HistoryItem({ a }) {
  const types = useList("activity-type")
  const system = a.type === "system"
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-sm", system ? "bg-muted text-muted-foreground" : a.status === "missed" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary")}>
        <Icon name={system ? "git-commit-line" : (types.map[a.type]?.icon ?? "chat-1-line")} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm">
          {system ? (
            <span className="text-muted-foreground">{a.notes}</span>
          ) : (
            <>
              <span className="font-medium">{types.label(a.type)}</span>
              {a.status === "missed" && <span className="text-red-600 dark:text-red-400"> · missed</span>}
              {a.outcome && <span className="text-muted-foreground"> · {outcomeLabel(a.outcome)}</span>}
              {a.project && <span className="text-muted-foreground"> · {a.project.name}</span>}
            </>
          )}
        </p>
        {!system && a.notes && <p className="mt-0.5 text-sm whitespace-pre-line text-muted-foreground">{a.notes}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {timeAgo(a.doneAt ?? a.at)}
          {a.by ? ` · ${a.by.name}` : ""}
        </p>
      </div>
    </li>
  )
}

// The lead window: where it is, what to do next, what happened, and its details
export function LeadDialog({ code, agents, projects, access, me, onClose }) {
  const router = useRouter()
  const types = useList("activity-type")
  const sources = useList("lead-source")
  const reasons = useList("loss-reason")
  const unitTypes = useList("unit-type")
  const [lead, setLead] = useState(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(null)
  const [panel, setPanel] = useState(null) // { kind: "outcome", type, plannedId? } | { kind: "plan" }
  const [dialog, setDialog] = useState(null) // "edit" | "lost"
  const [lossReason, setLossReason] = useState("")
  const [pending, startTransition] = useTransition()

  const reload = useCallback(
    () =>
      startTransition(async () => {
        const r = await loadLead(code)
        if (r.error) setError(r.error)
        else setLead(r.lead)
      }),
    [code],
  )
  useEffect(() => reload(), [reload])

  const run = (fn, done) =>
    startTransition(async () => {
      setNotice(null)
      const r = await fn()
      if (r?.error) setNotice({ tone: "error", text: r.error })
      else {
        done?.(r)
        const fresh = await loadLead(code)
        if (fresh.lead) setLead(fresh.lead)
        router.refresh()
      }
    })

  const canEdit = access.edit
  const closed = lead && ["booked", "lost"].includes(lead.status)
  const contactTypes = [
    { value: "call", label: "Call", icon: "phone-line" },
    { value: "whatsapp", label: "WhatsApp", icon: "whatsapp-line" },
    { value: "meeting", label: "Meeting", icon: "team-line" },
    { value: "site-visit", label: "Site visit", icon: "map-pin-user-line" },
  ]

  if (dialog === "edit" && lead) {
    return (
      <LeadForm
        lead={lead}
        agents={agents}
        projects={projects}
        access={access}
        me={me}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null)
          reload()
          router.refresh()
        }}
      />
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-[min(64rem,calc(100%-4rem))]"
      title={
        lead ? (
          <span className="flex flex-wrap items-center gap-2">
            <TempIcon priority={lead.priority} className="text-xl" />
            {lead.name}
            <LeadStatusBadge status={lead.status} />
          </span>
        ) : (
          "Lead"
        )
      }
      description={lead ? [formatPkPhone(lead.phone), lead.city, lead.overseas && "Overseas", lead.code].filter(Boolean).join(" · ") : error ? "" : "Loading…"}
      headerActions={
        lead &&
        canEdit && (
          <>
            <IconButton icon="edit-line" aria-label="Edit details" onClick={() => setDialog("edit")} />
            <DropdownMenu
              align="end"
              items={[
                ...(closed
                  ? [{ label: "Reopen lead", icon: "restart-line", onClick: () => run(() => setLeadStatus(lead.code, "contacted")) }]
                  : [
                      { label: "Mark as booked", icon: "checkbox-circle-line", onClick: () => run(() => setLeadStatus(lead.code, "booked"), () => setNotice({ tone: "success", text: "Marked as booked. Well done!" })) },
                      { label: "Mark as lost…", icon: "close-circle-line", variant: "destructive", onClick: () => setDialog("lost") },
                    ]),
              ]}
              trigger={<IconButton icon="more-2-line" aria-label="More" tooltip={false} />}
            />
          </>
        )
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!lead && !error && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Icon name="loader-3-fill" className="animate-spin text-2xl" />
        </div>
      )}
      {lead && (
        <div className="space-y-4">
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          {closed ? (
            <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm", lead.status === "booked" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-red-500/10 text-red-800 dark:text-red-300")}>
              <Icon name={lead.status === "booked" ? "checkbox-circle-line" : "close-circle-line"} className="text-base" />
              <span className="flex-1">
                {lead.status === "booked" ? "Booked" : `Lost${lead.lossReason ? `: ${reasons.label(lead.lossReason)}` : ""}`}
                {lead.closedAt ? ` · ${timeAgo(lead.closedAt)}` : ""}
              </span>
            </div>
          ) : (
            <Stepper status={lead.status} canEdit={canEdit} onPick={(st) => run(() => setLeadStatus(lead.code, st))} />
          )}

          {/* One row of things to do */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon="phone-line" nativeButton={false} render={<a href={telHref(lead.phone)} />} onClick={() => canEdit && !closed && setPanel({ kind: "outcome", type: "call" })}>
              Call
            </Button>
            {lead.whatsapp && (
              <Button variant="outline" leftIcon="whatsapp-line" className="text-emerald-700 dark:text-emerald-400" nativeButton={false} render={<a href={whatsappHref(lead.phone, lead.name)} target="_blank" rel="noreferrer" />} onClick={() => canEdit && !closed && setPanel({ kind: "outcome", type: "whatsapp" })}>
                WhatsApp
              </Button>
            )}
            {canEdit && !closed && (
              <>
                <Button variant="outline" leftIcon="chat-check-line" onClick={() => setPanel({ kind: "outcome", type: "call", pick: true })}>
                  Log
                </Button>
                <Button variant="outline" leftIcon="calendar-schedule-line" onClick={() => setPanel({ kind: "plan" })}>
                  Follow-up
                </Button>
              </>
            )}
          </div>

          {panel?.kind === "outcome" && (
            <OutcomeCard
              key={`${panel.type}-${panel.plannedId ?? ""}`}
              title={panel.plannedId ? `${types.label(panel.type)} done: how did it go?` : `${panel.pick ? "What happened?" : `${types.label(panel.type)}: how did it go?`}`}
              type={panel.type}
              types={contactTypes}
              showType={Boolean(panel.pick)}
              onType={(t) => setPanel((p) => ({ ...p, type: t }))}
              pending={pending}
              onCancel={() => setPanel(null)}
              onSave={(v) =>
                run(
                  () => (panel.plannedId ? updatePlannedActivity(lead.code, panel.plannedId, { action: "done", ...v }) : logLeadActivity(lead.code, { type: panel.type, ...v })),
                  () => {
                    setPanel(null)
                    setNotice({ tone: "success", text: v.next ? "Saved, and the next follow-up is planned." : "Saved." })
                    if (v.outcome === "not-interested") setDialog("lost")
                  },
                )
              }
            />
          )}
          {panel?.kind === "plan" && <PlanCard lead={lead} projects={projects} pending={pending} onCancel={() => setPanel(null)} onSave={(v) => run(() => planLeadActivity(lead.code, v), () => setPanel(null))} />}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              {/* Next step */}
              {lead.planned.length > 0 && (
                <section className="rounded-xl border">
                  <h3 className="border-b px-4 py-2.5 text-sm font-semibold">Next {lead.planned.length > 1 ? `· ${lead.planned.length} planned` : ""}</h3>
                  <ul className="divide-y">
                    {lead.planned.map((a) => {
                      const due = dueText(a.at)
                      return (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                            <Icon name={types.map[a.type]?.icon ?? "calendar-line"} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {types.label(a.type)}
                              {a.project ? ` · ${a.project.name}` : ""}
                            </span>
                            <span className={cn("block text-xs", due.tone)}>
                              {due.text}
                              {a.notes ? <span className="text-muted-foreground"> · {a.notes}</span> : null}
                            </span>
                          </span>
                          {canEdit && (
                            <span className="flex items-center gap-1">
                              <Button size="sm" leftIcon="check-line" onClick={() => setPanel({ kind: "outcome", type: a.type, plannedId: a.id })}>
                                Done
                              </Button>
                              <DropdownMenu
                                align="end"
                                items={[
                                  { type: "label", label: "Move to" },
                                  ...FOLLOW_UP_PRESETS.map((p) => ({ label: p.label, onClick: () => run(() => updatePlannedActivity(lead.code, a.id, { action: "reschedule", next: p.value })) })),
                                  { type: "separator" },
                                  ...(a.type === "site-visit" ? [{ label: "Didn't come (no-show)", icon: "user-unfollow-line", onClick: () => run(() => updatePlannedActivity(lead.code, a.id, { action: "missed", notes: "No-show" })) }] : []),
                                  { label: "Remove", icon: "delete-bin-6-line", variant: "destructive", onClick: () => run(() => updatePlannedActivity(lead.code, a.id, { action: "cancel" })) },
                                ]}
                                trigger={<IconButton icon="more-2-line" size="sm" aria-label="More" tooltip={false} />}
                              />
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
              {lead.planned.length === 0 && !closed && (
                <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  <Icon name="alarm-warning-line" className="text-amber-500" /> No follow-up planned.
                  {canEdit && (
                    <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => setPanel({ kind: "plan" })}>
                      Plan one
                    </button>
                  )}
                </p>
              )}

              {/* What happened */}
              <section className="rounded-xl border">
                <h3 className="border-b px-4 py-2.5 text-sm font-semibold">History</h3>
                {lead.history.length ? (
                  <ol className="relative px-4 py-3 before:absolute before:top-5 before:bottom-5 before:left-[1.82rem] before:w-px before:bg-border">
                    {lead.history.map((a) => (
                      <HistoryItem key={a.id} a={a} />
                    ))}
                  </ol>
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet. Calls, messages and visits show here.</p>
                )}
              </section>
            </div>

            {/* Everything about them, in one card */}
            <aside className="space-y-4">
              <section className="rounded-xl border px-4 py-3">
                <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Owner</h3>
                {canEdit && access.reassign ? (
                  <PersonPicker aria-label="Owner" people={agents} me={me} value={lead.agent?.id ?? null} onChange={(id) => id !== (lead.agent?.id ?? null) && run(() => assignLeads([lead.code], id))} />
                ) : !lead.agent && canEdit ? (
                  <Button size="sm" variant="outline" leftIcon="user-add-line" onClick={() => run(() => assignLeads([lead.code], me))}>
                    Take this lead
                  </Button>
                ) : (
                  <AgentChip agent={lead.agent} />
                )}
                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Temperature</p>
                  <TempPicker value={lead.priority} disabled={!canEdit} onChange={(v) => run(() => setLeadPriority(lead.code, v))} />
                </div>
              </section>

              <section className="rounded-xl border px-4 py-3">
                <dl className="divide-y">
                  <Row label="Looking for">{interestText(lead.interest, { typeLabel: unitTypes.label })}</Row>
                  <Row label="Budget">{budgetText(lead.interest, formatPkr)}</Row>
                  <Row label="Payment">
                    {[PAYMENT_PLANS.find((p) => p.value === lead.interest.paymentPlan)?.label, PURPOSES.find((p) => p.value === lead.interest.purpose)?.label].filter(Boolean).join(" · ")}
                  </Row>
                  <Row label="Mobile">
                    <a href={telHref(lead.phone)} className="hover:text-primary">
                      {formatPkPhone(lead.phone)}
                    </a>
                  </Row>
                  <Row label="Email">{lead.email && <a href={`mailto:${lead.email}`} className="break-all hover:text-primary">{lead.email}</a>}</Row>
                  <Row label="Source">{lead.source && sources.label(lead.source)}</Row>
                  <Row label="Added">{timeAgo(lead.createdAt)}</Row>
                  <Row label="Last contact">{lead.lastContactAt && timeAgo(lead.lastContactAt)}</Row>
                </dl>
                {lead.notes && <p className="mt-2 border-t pt-2 text-sm whitespace-pre-line text-muted-foreground">{lead.notes}</p>}
              </section>
            </aside>
          </div>
        </div>
      )}

      {dialog === "lost" && lead && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          className="sm:max-w-md"
          title={`Mark ${lead.name} as lost?`}
          description="Planned follow-ups are dropped. You can reopen the lead later."
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                leftIcon="close-circle-line"
                disabled={!lossReason}
                loading={pending}
                onClick={() =>
                  run(
                    () => setLeadStatus(lead.code, "lost", { lossReason }),
                    () => {
                      setDialog(null)
                      setLossReason("")
                    },
                  )
                }
              >
                Mark as lost
              </Button>
            </>
          }
        >
          <LookupSelect list="loss-reason" label="Why?" value={lossReason} onChange={setLossReason} />
        </Dialog>
      )}
    </Dialog>
  )
}
