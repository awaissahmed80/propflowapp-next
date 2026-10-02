"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { urlCode } from "@/lib/url"
import { formatDateTime, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { Notice } from "@/modules/users/components/user-parts"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DatePicker, TimePicker } from "@/components/ui/datetimepicker"
import { BaseDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ScrollView } from "@/components/ui/scroll-view"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { IconButton } from "@/components/ui/icon-button"
import { PersonPicker } from "@/components/person-picker"
import { Select } from "@/components/ui/select"
import { BaseTabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip } from "@/components/ui/tooltip"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { PAYMENT_PLANS, PURPOSES, budgetText, interestText } from "../constants"
import { archiveLeads, assignLeads, loadLead, sendLeadEmail, logLeadActivity, planLeadActivity, setLeadPriority, setLeadStatus, updatePlannedActivity } from "../server/leads"
import { LeadForm } from "./lead-form"
import { ContactCardButton } from "./contact-card"
import { StatusChangeDialog } from "./status-change-dialog"
import { DealTab } from "./deal-tab"
import { LeadScoreCard } from "./lead-score"
import { VoiceRecorder } from "./voice-recorder"
import { VoicePlayer } from "@/components/voice-player"
import { AgentChip, LeadStatusBadge, StatusMenu, TempMenu, TempPicker, dueText, telHref, whatsappHref } from "./lead-parts"

// The "Log" and "Follow-up" buttons under the tabs are hidden for now; the log form (OutcomeCard)
// stays in use, e.g. Call / WhatsApp in the header still ask "how did it go?". Planning now
// happens in the follow-up bar (PlanInline): before bringing "Follow-up" back, point it there.
// Set to true to bring the buttons back.
const SHOW_LOG_AND_FOLLOW_UP = false

// A colour from a list as text colour on a light tint of itself (icons, chips)
const tint = (hex, amount = 14) => ({ color: hex, backgroundColor: `color-mix(in oklab, ${hex} ${amount}%, transparent)` })

// Quick replies (Lists & Labels): tap one to add its text
function QuickReplies({ onPick, className }) {
  const replies = useList("quick-reply")
  if (!replies.options.length) return null
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {replies.options.map((o) => {
        const text = replies.map[o.value]?.meta?.text || o.label
        return (
          <button
            key={o.value}
            type="button"
            title={text}
            onClick={() => onPick(text)}
            className="flex cursor-pointer items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[13px] text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name={replies.map[o.value]?.icon ?? "chat-quote-line"} className="text-sm" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
// A borderless pick-one menu: the trigger is the current choice (coloured icon + label + ▾)
//   options: [{ value, label, icon, color }]
function MenuPick({ value, options, onChange, "aria-label": ariaLabel, align = "start", side = "bottom" }) {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <DropdownMenu
      align={align}
      side={side}
      items={options.map((o) => ({
        label: o.label,
        icon: <Icon name={o.icon ?? "checkbox-blank-circle-line"} style={{ color: o.color }} />,
        selected: o.value === current?.value,
        onClick: () => o.value !== current?.value && onChange(o.value),
      }))}
      trigger={
        <button
          type="button"
          aria-label={`${ariaLabel}: ${current?.label ?? ""}`}
          className="inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-[14px] font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
        >
          <Icon name={current?.icon ?? "checkbox-blank-circle-line"} className="shrink-0 text-base" style={{ color: current?.color }} />
          <span className="truncate">{current?.label}</span>
          <Icon name="arrow-down-s-line" className="shrink-0 text-sm text-muted-foreground" />
        </button>
      }
    />
  )
}

const addLine = (text, line) => (text.trim() ? `${text.replace(/\s+$/, "")}\n${line}` : line)

function OutcomeCard({ title, type, onType, pending, onSave, onCancel, statusTo, onClearStatus }) {
  const types = useList("activity-type")
  const outcomes = useList("activity-outcome")
  const followUps = useList("follow-up")
  const replies = useList("quick-reply")
  const [outcome, setOutcome] = useState("")
  const [notes, setNotes] = useState("")
  const [next, setNext] = useState(() => followUps.defaultValue || followUps.options[0]?.value || "none")
  const [nextType, setNextType] = useState("") // how to follow up; "" = same kind as what was done
  const [voice, setVoice] = useState(null) // { blob, url, seconds, type } once recorded
  const [recording, setRecording] = useState(false)
  const [lossReason, setLossReason] = useState("") // when moving to Lost
  const [nextTime, setNextTime] = useState("11:00") // what time to follow up
  const closing = statusTo === "booked" || statusTo === "lost"
  const dropVoice = () => {
    if (voice) URL.revokeObjectURL(voice.url)
    setVoice(null)
  }
  const pick = (o) => {
    setOutcome(o)
    // Not interested: usually no follow-up (they're offered "Mark as lost" next)
    if (o === "not-interested") setNext("none")
  }
  const color = (v) => toHex(outcomes.map[v]?.color) ?? "#64748b"
  // The workspace may have switched this type off (Lists & Labels): fall back to the first active one
  const current = types.options.some((o) => o.value === type) ? type : (types.options[0]?.value ?? type)
  // Follow up by: what they picked, else the same kind (after a site visit, a call)
  const sameKind = current === "site-visit" && types.options.some((o) => o.value === "call") ? "call" : current
  const followBy = nextType && types.options.some((o) => o.value === nextType) ? nextType : sameKind
  const typeOptions = types.options.map((t) => ({ value: t.value, label: t.label, icon: types.map[t.value]?.icon, color: toHex(types.map[t.value]?.color) ?? "#2563eb" }))
  const whenOptions = [
    ...followUps.options.map((f) => ({ value: f.value, label: f.label, icon: followUps.map[f.value]?.icon ?? "calendar-line", color: toHex(followUps.map[f.value]?.color) ?? "var(--primary)" })),
    { value: "none", label: "No follow-up", icon: "close-circle-line", color: "var(--muted-foreground)" },
  ]
  const picked = outcomes.map[outcome]

  return (
    <section aria-label={title}>
      {/* A status change made with this log: say where it's going (Lost: why) */}
      {statusTo && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary/[0.06] px-5 py-2 sm:px-6">
          <Icon name="flag-2-line" className="text-base text-primary" />
          <span className="text-[13px] font-medium">Moving to</span>
          <LeadStatusBadge status={statusTo} className="h-6 px-2 text-[13px]" />
          {statusTo === "lost" && (
            <div className="w-52">
              <LookupSelect list="loss-reason" aria-label="Why was it lost?" placeholder="Why was it lost?" size="sm" value={lossReason} onChange={setLossReason} />
            </div>
          )}
          <span className="flex-1" />
          <span className="text-[12px] text-muted-foreground">A note is required</span>
          <IconButton icon="close-line" size="sm" aria-label="Don't change the status" onClick={onClearStatus} />
        </div>
      )}
      {/* 1. What was done */}
      <header className="flex items-center gap-1 pt-2.5 pr-3 pl-5 sm:pl-6">
        <span className="text-[13px] font-medium text-muted-foreground">Contacted via</span>
        <MenuPick aria-label="Contacted via" value={current} onChange={onType} options={typeOptions} />
        <span className="flex-1" />
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          leftIcon="check-line"
          loading={pending}
          disabled={recording || (statusTo ? !notes.trim() && !voice : !outcome && !notes.trim() && !voice) || (statusTo === "lost" && !lossReason)}
          onClick={() =>
            onSave({
              type: current,
              outcome,
              notes,
              nextTime: next === "none" || closing ? "" : nextTime,
              next: next === "none" || closing ? "" : next,
              nextType: next === "none" || closing ? "" : followBy,
              voice,
              statusTo: statusTo ?? "",
              lossReason,
            })
          }
        >
          Save
        </Button>
      </header>

      {/* 2. Note, with how it went and quick replies inside the box */}
      <div className="px-5 py-2 sm:px-6">
        <div className="rounded-lg border border-input bg-background shadow-xs transition focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/20">
          <textarea
            aria-label="Note"
            rows={2}
            placeholder="Add a note: what they said, what they want next…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {voice && (
            <div className="mx-2 mb-1.5 flex items-center gap-2 rounded-lg bg-muted/60 py-1 pr-1 pl-2">
              <VoicePlayer src={voice.url} seconds={voice.seconds} className="flex-1" />
              <IconButton icon="close-line" size="sm" aria-label="Remove voice note" onClick={dropVoice} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
            {!recording && (
              <>
                <DropdownMenu
                  align="start"
                  side="top"
                  items={outcomes.options.map((o) => ({
                    label: o.label,
                    icon: <Icon name={outcomes.map[o.value]?.icon ?? "checkbox-blank-circle-line"} style={{ color: color(o.value) }} />,
                    selected: o.value === outcome,
                    onClick: () => pick(o.value),
                  }))}
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !picked && "border-dashed text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                      style={picked ? { borderColor: color(outcome), ...tint(color(outcome), 12) } : undefined}
                    >
                      <Icon name={picked?.icon ?? "question-line"} className="text-sm" />
                      {picked ? picked.label : "How did it go?"}
                      <Icon name="arrow-down-s-line" className="text-sm opacity-70" />
                    </button>
                  }
                />
                {replies.options.length > 0 && (
                  <DropdownMenu
                    align="start"
                    side="top"
                    className="w-64"
                    items={replies.options.map((o) => ({
                      label: o.label,
                      icon: replies.map[o.value]?.icon ?? "chat-quote-line",
                      onClick: () => setNotes((n) => addLine(n, replies.map[o.value]?.meta?.text || o.label)),
                    }))}
                    trigger={
                      <button
                        type="button"
                        className="flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px] text-muted-foreground transition outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon name="chat-quote-line" className="text-sm" /> Quick reply
                      </button>
                    }
                  />
                )}
              </>
            )}
            {/* Voice note, like WhatsApp: the mic sits at the end; while recording, this row becomes the recorder */}
            {!voice && <VoiceRecorder className={recording ? "w-full" : "ml-auto"} onRecordingChange={setRecording} onDone={(v) => setVoice(v)} />}
          </div>
        </div>
      </div>

      {/* 3. The next follow-up (when, how) and save */}
      {!closing && (
        <footer className="flex flex-wrap items-center gap-1 px-5 pb-3 sm:px-6">
          <>
            <span className="mr-0.5 text-[13px] font-medium text-muted-foreground">Next follow-up</span>
            <MenuPick aria-label="Next follow-up" side="top" value={next} onChange={(v) => setNext(v || "none")} options={whenOptions} />
            {next !== "none" && (
              <>
                <span className="text-[13px] font-medium text-muted-foreground">at</span>
                <TimePicker
                  aria-label="Follow-up time"
                  size="sm"
                  side="top"
                  clearable={false}
                  minuteStep={15}
                  className="w-auto"
                  triggerClassName="h-7 w-auto gap-1.5 rounded-md border-0 bg-transparent px-2 text-[14px] font-medium shadow-none hover:bg-muted dark:bg-transparent data-popup-open:bg-muted"
                  value={nextTime}
                  onChange={(v) => v && setNextTime(v)}
                />
              </>
            )}
            {next !== "none" && (
              <>
                <span className="text-[13px] font-medium text-muted-foreground">via</span>
                <MenuPick aria-label="Follow up via" side="top" value={followBy} onChange={(v) => v && setNextType(v)} options={typeOptions} />
              </>
            )}
          </>
        </footer>
      )}
    </section>
  )
}

// Plan a follow-up or site visit for a chosen day
// Plan the next follow-up right in the bar: "Plan a [Call ▾] on [day] at [time]" (+ project for a visit)
function PlanInline({ lead, projects, pending, onSave, onCancel }) {
  const types = useList("activity-type")
  const [type, setType] = useState(() => (types.options.some((o) => o.value === "call") ? "call" : (types.options[0]?.value ?? "call")))
  const [day, setDay] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [time, setTime] = useState("11:00")
  const [projectCode, setProjectCode] = useState(lead.interest.project?.code ?? "")
  const typeOptions = types.options.map((t) => ({ value: t.value, label: t.label, icon: types.map[t.value]?.icon, color: toHex(types.map[t.value]?.color) ?? "#2563eb" }))
  const visit = type === "site-visit"
  // Borderless, like the type menu, so the sentence reads as one line
  const inline = "h-7 w-auto gap-1.5 rounded-md border-0 bg-transparent px-2 text-[14px] font-medium shadow-none hover:bg-muted dark:bg-transparent data-popup-open:bg-muted"
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1 text-[15px]">
        <span className="mr-0.5 text-muted-foreground">Plan a</span>
        <MenuPick aria-label="Plan a" value={type} onChange={setType} options={typeOptions} />
        <span className="mx-0.5 text-muted-foreground">on</span>
        <DatePicker aria-label="Day" size="sm" clearable={false} className="w-auto" triggerClassName={inline} value={day} onChange={(v) => v && setDay(v)} />
        <span className="mx-0.5 text-muted-foreground">at</span>
        <TimePicker aria-label="Time" size="sm" clearable={false} minuteStep={15} className="w-auto" triggerClassName={inline} value={time} onChange={(v) => v && setTime(v)} />
        {visit && (
          <>
            <span className="mx-0.5 text-muted-foreground">to</span>
            <Select
              aria-label="Project"
              size="sm"
              triggerClassName={cn(inline, "max-w-48")}
              placeholder="Pick the project"
              value={projectCode}
              onChange={setProjectCode}
              options={projects.map((p) => ({ value: p.code, label: p.name }))}
            />
          </>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1">
        <IconButton icon="close-line" size="sm" aria-label="Cancel" onClick={onCancel} />
        <Button size="sm" leftIcon="calendar-check-line" loading={pending} disabled={visit && !projectCode} onClick={() => onSave({ type, at: `${day}T${time}`, projectCode })}>
          Plan it
        </Button>
      </span>
    </div>
  )
}

// "Archive lead?": out of the pipeline (list, board, due follow-ups), with an optional reason for
// the timeline. Nothing is lost: restoring brings it back as it was.
//   name: the lead's name, or "3 leads" with many
export function ArchiveDialog({ name, many = false, pending, onClose, onConfirm }) {
  const [note, setNote] = useState("")
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title={`Archive ${name}?`}
      description={
        many
          ? "They leave the pipeline: off the board and the lists, and their follow-ups stop showing as due. Status, history and follow-ups are kept; restore them any time from the Archived tab."
          : "It leaves the pipeline: off the board and the lists, and its follow-ups stop showing as due. Its status, history and follow-ups are kept, and you can restore it any time from the Archived tab."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="archive-line" loading={pending} onClick={() => onConfirm(note.trim())}>
            Archive
          </Button>
        </>
      }
    >
      <Textarea label="Why (optional)" rows={3} placeholder="e.g. Not ready to buy this year; check back after Eid" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  )
}

// Lead details: the score, then everything known about them in labelled groups (two columns
// when there's room). Empty values show a dash so the layout stays put.
function Group({ title, icon, children }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon name={icon} className="text-[15px]" />
        {title}
      </h3>
      <dl className="grid gap-x-6 gap-y-3.5 @md:grid-cols-2">{children}</dl>
    </section>
  )
}
function Field({ label, children, wide }) {
  return (
    <div className={cn("min-w-0", wide && "@md:col-span-2")}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[15px] break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function LeadDetails({ lead, agents, me, access, canEdit, run }) {
  const sources = useList("lead-source")
  const unitTypes = useList("unit-type")
  const lossReasons = useList("loss-reason")
  const i = lead.interest
  return (
    <div className="space-y-4">
      {lead.score && <LeadScoreCard score={lead.score} status={lead.status} />}

      <div className="divide-y rounded-xl border bg-background">
        <Group title="Looking for" icon="search-eye-line">
          <Field label="Project">
            {i.project ? (
              <a href={`/estate/projects/${urlCode(i.project.code)}`} className="font-medium text-primary hover:underline">
                {i.project.name}
              </a>
            ) : null}
          </Field>
          <Field label="Unit">{interestText({ ...i, project: null }, { typeLabel: unitTypes.label }).replace(/^—$/, "")}</Field>
          <Field label="Budget">{budgetText(i, formatPkr)}</Field>
          <Field label="Payment">{PAYMENT_PLANS.find((p) => p.value === i.paymentPlan)?.label}</Field>
          <Field label="Purpose">{PURPOSES.find((p) => p.value === i.purpose)?.label}</Field>
        </Group>

        <Group title="Contact" icon="contacts-line">
          <Field label="Mobile">
            <span className="flex items-center gap-1.5">
              <a href={telHref(lead.phone)} className="tabular-nums hover:text-primary">
                {formatPkPhone(lead.phone)}
              </a>
              {lead.whatsapp && <Icon name="whatsapp-line" className="text-emerald-600 dark:text-emerald-400" title="On WhatsApp" />}
            </span>
          </Field>
          <Field label="Email">
            {lead.email ? (
              <a href={`mailto:${lead.email}`} className="break-all hover:text-primary">
                {lead.email}
              </a>
            ) : null}
          </Field>
          <Field label="City">{[lead.city, lead.overseas && "Overseas"].filter(Boolean).join(" · ")}</Field>
          <Field label="Source">{lead.source ? sources.label(lead.source) : null}</Field>
        </Group>

        <Group title="Handling" icon="user-settings-line">
          <Field label="Agent">
            {canEdit && access.reassign ? (
              <div className="mt-1">
                <PersonPicker aria-label="Agent" people={agents} me={me} value={lead.agent?.id ?? null} onChange={(id) => id !== (lead.agent?.id ?? null) && run(() => assignLeads([lead.code], id))} />
              </div>
            ) : !lead.agent && canEdit ? (
              <Button size="sm" variant="outline" className="mt-1" leftIcon="user-add-line" onClick={() => run(() => assignLeads([lead.code], me))}>
                Take this lead
              </Button>
            ) : (
              <AgentChip agent={lead.agent} className="mt-1" />
            )}
          </Field>
          <Field label="Temperature">
            <div className="mt-1">
              <TempPicker value={lead.priority} disabled={!canEdit} onChange={(v) => run(() => setLeadPriority(lead.code, v))} />
            </div>
          </Field>
          <Field label="Added">{formatDateTime(lead.createdAt)}</Field>
          <Field label="Last contact">{lead.lastContactAt ? timeAgo(lead.lastContactAt) : "Not contacted yet"}</Field>
          {lead.closedAt && <Field label={lead.status === "lost" ? "Lost" : "Booked"}>{formatDateTime(lead.closedAt)}</Field>}
          {lead.status === "lost" && <Field label="Reason">{lead.lossReason ? lossReasons.label(lead.lossReason) : null}</Field>}
        </Group>

        <Group title="Notes" icon="sticky-note-line">
          <Field label="Notes" wide>
            {lead.notes ? <span className="whitespace-pre-line">{lead.notes}</span> : <span className="text-muted-foreground">No notes. Add some with Edit details.</span>}
          </Field>
        </Group>
      </div>
    </div>
  )
}

// Icons for system notes: the status a lead moved to, or who it was given to
const STATUS_ICONS = {
  new: "add-circle-line",
  contacted: "chat-check-line",
  interested: "thumb-up-line",
  "site-visit": "map-pin-user-line",
  negotiation: "hand-coin-line",
  booked: "checkbox-circle-line",
  lost: "close-circle-line",
}
// "Status: New → Contacted (reason)" / "Status → Site visit scheduled" → the status moved to
function statusIn(note, statuses) {
  const label = /^Status\b.*?→\s*(.+?)(?:\s*\(.*\))?$/.exec(String(note ?? "").split("\n")[0])?.[1]
  return label ? statuses.options.find((o) => o.label === label)?.value : null
}

// Small icon on the timeline for a system note: the new status in its colour, or a person icon
function SystemIcon({ note, statuses }) {
  const status = statusIn(note, statuses)
  const color = status ? (toHex(statuses.map[status]?.color) ?? "#94a3b8") : null
  const icon = status
    ? (STATUS_ICONS[status] ?? "flag-line")
    : /^(Given to|Unassigned)/.test(note ?? "")
      ? "user-shared-line"
      : /^Archived/.test(note ?? "")
        ? "archive-line"
        : /^Restored/.test(note ?? "")
          ? "inbox-unarchive-line"
          : "git-commit-line"
  return (
    <span
      className={cn("flex size-5 items-center justify-center rounded-full text-[12px] ring-4 ring-background", !color && "bg-muted text-muted-foreground")}
      style={color ? { color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined}
    >
      <Icon name={icon} />
    </span>
  )
}

// One entry in the history. People's entries (calls, WhatsApp, email, visits) stand out with
// their icon and notes; system notes (status changes, assignment) are one small muted line.
function HistoryItem({ a }) {
  const types = useList("activity-type")
  const statuses = useList("lead-status")
  const outcomes = useList("activity-outcome")
  const ago = timeAgo(a.doneAt ?? a.at)
  const who = a.by?.name ?? "Someone"
  if (a.type === "system") {
    // "Status: A → B" (muted, with who did it), and the update they gave with it, if any
    const [line, ...rest] = String(a.notes ?? "").split("\n\n")
    const update = rest.join("\n\n").trim()
    return (
      <li className={cn("relative flex gap-3 last:pb-0", update ? "items-start pb-6" : "items-center pb-4")}>
        {/* Same 28px column as the avatars, so the timeline runs straight through */}
        <span className="relative z-10 flex size-7 shrink-0 items-center justify-center">
          <SystemIcon note={line} statuses={statuses} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground", update && "pt-1.5")}>
            {a.by && <Avatar name={a.by.name} source={a.by.avatarUrl} size="sm" className="size-[18px] text-[8px]" />}
            {a.by && <span className="font-medium text-foreground/80">{who}</span>}
            <span>{line}</span>
            <span className="opacity-75">· {ago}</span>
          </p>
          {update && <p className="mt-2 rounded-lg bg-muted/50 px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-line">{update}</p>}
        </div>
      </li>
    )
  }
  const missed = a.status === "missed"
  const color = missed ? "#dc2626" : (toHex(types.map[a.type]?.color) ?? "#2563eb")
  return (
    <li className="relative flex gap-3 pb-7 last:pb-0">
      {/* Who did it, with what they did as a badge on the corner */}
      <span className="relative z-10 size-7 shrink-0">
        <Avatar name={who} source={a.by?.avatarUrl} className="size-7 text-[11px] ring-4 ring-background" />
        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full text-[9px] text-white ring-2 ring-background" style={{ backgroundColor: color }} title={types.label(a.type)}>
          <Icon name={types.map[a.type]?.icon ?? "chat-1-line"} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {/* Who and when, then what they did */}
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold">{who}</span>
          <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">{ago}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          <span className="font-medium" style={{ color }}>
            {types.label(a.type)}
          </span>
          {missed && <span className="text-red-600 dark:text-red-400"> · missed</span>}
          {a.outcome && <span> · {outcomes.label(a.outcome)}</span>}
          {a.project && <span> · {a.project.name}</span>}
        </p>
        {a.notes && <p className="mt-2.5 rounded-lg rounded-tl-sm bg-muted/50 px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-line">{a.notes}</p>}
        {a.voice && (
          <div className="mt-2.5 flex max-w-sm items-center gap-2 rounded-lg bg-muted/60 py-1 pr-2 pl-2.5">
            <VoicePlayer src={a.voice.url} className="flex-1" />
          </div>
        )}
      </div>
    </li>
  )
}

// The lead window: where it is, what to do next, what happened, and its details
// The same lead details in three frames:
//   docked: inline next to the list (wide screens) · modal: a centred dialog (board) · otherwise a sheet
// initialStatusTo: open with the log form set to move the lead there (a board drag when notes are required)
// initialDeal: "won" | "lost" to open on the Close deal tab at that step (the board's Booked / Lost columns)
export function LeadDialog({ code, agents, projects, access, me, onClose, onOpenLead, docked = false, modal = false, initialStatusTo = null, initialDeal = null }) {
  const router = useRouter()
  const types = useList("activity-type")
  const sources = useList("lead-source")
  const reasons = useList("loss-reason")
  const followUps = useList("follow-up")
  const unitTypes = useList("unit-type")
  const [lead, setLead] = useState(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState(null)
  const [panel, setPanel] = useState(() => (initialStatusTo ? { kind: "outcome", type: "call", statusTo: initialStatusTo } : null)) // { kind: "outcome", type, plannedId?, statusTo? } | { kind: "plan" }
  const [dialog, setDialog] = useState(null) // "edit" | "email"
  const [emailReady, setEmailReady] = useState(false) // the workspace has email set up
  const [tab, setTab] = useState(initialDeal ? "deal" : "log") // "log" | "details" | "deal"
  const [dealMode, setDealMode] = useState(initialDeal ?? "choose") // where the Close deal tab starts

  // The history reads top to bottom, latest last: glide to the bottom when the lead opens, when
  // something new is added, when coming back to this tab, and when the log form opens (it takes
  // room from the bottom, so the latest entries stay in view)
  const scroller = useRef(null)
  // Success messages ("Saved…", "Email sent…") clear themselves after a few seconds; errors stay
  useEffect(() => {
    if (notice?.tone !== "success") return undefined
    const id = setTimeout(() => setNotice((n) => (n === notice ? null : n)), 4000)
    return () => clearTimeout(id)
  }, [notice])

  const latest = lead?.history[0]?.id ?? null
  const composing = panel?.kind === "outcome"
  useEffect(() => {
    const el = scroller.current
    if (!el || tab !== "log" || latest === null) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // After this render's layout, so the full list is measured
    const id = requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" }))
    return () => cancelAnimationFrame(id)
  }, [latest, tab, composing])
  const [changing, setChanging] = useState(null) // a status being confirmed (Lost, or any when an update is required)
  const [pending, startTransition] = useTransition()

  const reload = useCallback(
    () =>
      startTransition(async () => {
        const r = await loadLead(code)
        if (r.error) setError(r.error)
        else {
          setLead(r.lead)
          setEmailReady(Boolean(r.emailReady))
        }
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

  // Archived leads are read-only until they're restored to the pipeline
  const archived = Boolean(lead?.archivedAt)
  const canEdit = access.edit && !archived
  const [archiving, setArchiving] = useState(false) // the "Archive lead?" dialog
  const archive = (on, note = "") =>
    run(
      () => archiveLeads([lead.code], { archive: on, note }),
      () => {
        setArchiving(false)
        setPanel(null)
        setNotice({ tone: "success", text: on ? "Archived. It's out of the pipeline until you restore it." : "Restored to the pipeline." })
      },
    )
  // Every status change by hand: straight away, unless it's Lost (asks why) or the workspace asks
  // for an update with every change (Settings › CRM)
  const changeStatus = (st, extra = {}) => {
    // Closing goes through the Close deal tab: Won (booking) or Lost (why)
    if (!extra.confirmed && (st === "booked" || st === "lost")) {
      setDealMode(st === "booked" ? "won" : "lost")
      setTab("deal")
      return
    }
    // Notes required (Settings › CRM): the change goes through the log form, saved with what happened
    if (!extra.confirmed && access.statusNote) {
      setTab("log")
      setPanel({ kind: "outcome", type: "call", statusTo: st })
      return
    }
    if (!extra.confirmed && st === "lost") return setChanging(st)
    run(
      () => setLeadStatus(lead.code, st, extra),
      () => {
        setChanging(null)
        if (st === "booked") setNotice({ tone: "success", text: "Marked as booked. Well done!" })
      },
    )
  }
  const closed = lead && ["booked", "lost"].includes(lead.status)

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

  // Wide screens: a panel docked next to the list, under the page header. Otherwise a sheet
  // over the content area (below the top bar), with no dimming. Either way, picking another lead
  // switches it; × or Esc closes it.
  const Title = docked ? "h2" : modal ? DialogTitle : SheetTitle
  const Description = docked ? "p" : modal ? DialogDescription : SheetDescription
  const content = (
    <>
      {/* Top bar: the lead's code, with edit / more / close at the far end */}
      <div className="flex h-11 shrink-0 items-center gap-0.5 border-b px-5 sm:px-6">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-wide text-muted-foreground tabular-nums">{lead?.code ?? ""}</p>
        {/* Pulled right so the icons line up with the content's edge, not the buttons' padding */}
        <div className="-mr-2 flex items-center gap-0.5">
          {lead && archived && access.edit && (
            <Button size="sm" variant="outline" className="mr-1" leftIcon="inbox-unarchive-line" loading={pending} onClick={() => archive(false)}>
              Restore
            </Button>
          )}
          {lead && canEdit && (
            <>
              <IconButton icon="edit-line" size="sm" aria-label="Edit details" onClick={() => setDialog("edit")} />
              <DropdownMenu
                align="end"
                items={[
                  ...(closed
                    ? [{ label: "Reopen lead", icon: "restart-line", onClick: () => changeStatus("contacted") }]
                    : [
                        { label: "Mark as booked", icon: "checkbox-circle-line", onClick: () => changeStatus("booked") },
                        { label: "Mark as lost…", icon: "close-circle-line", variant: "destructive", onClick: () => changeStatus("lost") },
                      ]),
                  { type: "separator" },
                  { label: "Archive lead…", icon: "archive-line", onClick: () => setArchiving(true) },
                ]}
                trigger={<IconButton icon="more-2-line" size="sm" aria-label="More" tooltip={false} />}
              />
            </>
          )}
          <IconButton icon="close-line" size="sm" aria-label="Close" onClick={onClose} />
        </div>
      </div>
      <header className="shrink-0 border-b px-5 pt-4 pb-4 sm:px-6">
        {/* Who, with call / WhatsApp / email at the right end */}
        <div className="flex items-center gap-3">
          <Title className="min-w-0 flex-1 text-xl font-semibold tracking-tight">
            {lead ? (
              <span className="flex flex-wrap items-center gap-2">
                <TempMenu value={lead.priority} disabled={!canEdit} className="text-xl" onChange={(v) => run(() => setLeadPriority(lead.code, v))} />
                {lead.name}
                <ContactCardButton code={lead.code} onOpenLead={onOpenLead} onEmail={emailReady && lead.email && canEdit ? () => setDialog("email") : null} />
                <StatusMenu status={lead.status} badgeClassName="h-7 px-2.5 text-sm" disabled={!canEdit} onPick={(st) => changeStatus(st)} />
              </span>
            ) : (
              "Lead"
            )}
          </Title>
          {lead && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Calling or messaging opens "how did it go?" so it's logged in a tap */}
              <ContactIcon
                icon="phone-line"
                label="Call"
                href={telHref(lead.phone)}
                tone="green"
                onClick={() => {
                  if (!canEdit || closed) return
                  setTab("log") // the log form lives on this tab
                  setPanel({ kind: "outcome", type: "call" })
                }}
              />
              {lead.whatsapp && (
                <ContactIcon
                  icon="whatsapp-line"
                  label="WhatsApp"
                  href={whatsappHref(lead.phone, lead.name)}
                  external
                  tone="green"
                  onClick={() => {
                    if (!canEdit || closed) return
                    setTab("log")
                    setPanel({ kind: "outcome", type: "whatsapp" })
                  }}
                />
              )}
              {/* Only once the workspace has its own email set up (Settings › Email) */}
              {emailReady && lead.email && canEdit && <ContactIcon icon="mail-line" label={`Email ${lead.email}`} tone="blue" onClick={() => setDialog("email")} />}
            </div>
          )}
        </div>
        <Description className="mt-1">
          {lead
            ? [
                formatPkPhone(lead.phone),
                lead.city,
                lead.overseas && "Overseas",
                closed && `${lead.status === "booked" ? "Booked" : `Lost${lead.lossReason ? `: ${reasons.label(lead.lossReason)}` : ""}`}${lead.closedAt ? ` ${timeAgo(lead.closedAt)}` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : error
              ? ""
              : "Loading…"}
        </Description>
      </header>
      {/* Tabs under the name: the bar stays put (full width, no side margins); content scrolls below */}
      <BaseTabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        {lead && (
          <TabsList variant="line" className="w-full shrink-0 items-stretch justify-start gap-6 border-b px-5 py-0 group-data-horizontal/tabs:h-auto sm:px-6">
            <TabsTrigger value="log" className="h-auto flex-none rounded-none px-0.5 py-3 text-[15px] group-data-horizontal/tabs:after:bottom-[-1px]">
              <Icon name="history-line" className="text-base" /> Log &amp; history
            </TabsTrigger>
            <TabsTrigger value="details" className="h-auto flex-none rounded-none px-0.5 py-3 text-[15px] group-data-horizontal/tabs:after:bottom-[-1px]">
              <Icon name="file-list-3-line" className="text-base" /> Lead details
            </TabsTrigger>
            {(canEdit || closed) && (
              <TabsTrigger value="deal" className="h-auto flex-none rounded-none px-0.5 py-3 text-[15px] group-data-horizontal/tabs:after:bottom-[-1px]">
                <Icon name={lead.status === "booked" ? "trophy-line" : lead.status === "lost" ? "close-circle-line" : "flag-2-line"} className="text-base" /> {closed ? "Deal closed" : "Close deal"}
              </TabsTrigger>
            )}
          </TabsList>
        )}
        <ScrollView className="min-h-0 flex-1" viewportRef={scroller} viewportClassName="space-y-4 px-5 py-5 sm:px-6">
          {error && <Notice tone="error">{error}</Notice>}
          {!lead && !error && (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Icon name="loader-3-fill" className="animate-spin text-2xl" />
            </div>
          )}
          {lead && (
            <div className="space-y-4">
              {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
              {archived && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3">
                  <Icon name="archive-line" className="text-lg text-muted-foreground" />
                  <p className="min-w-0 flex-1 text-[14px] text-muted-foreground">
                    <span className="font-medium text-foreground">Archived</span> {timeAgo(lead.archivedAt)}
                    {lead.archivedBy && ` by ${lead.archivedBy.name}`}. It&apos;s out of the pipeline: not on the board, and its follow-ups aren&apos;t due.
                  </p>
                  {access.edit && (
                    <Button size="sm" leftIcon="inbox-unarchive-line" loading={pending} onClick={() => archive(false)}>
                      Restore to pipeline
                    </Button>
                  )}
                </div>
              )}

              {/* Log what happened, or plan the next step (calling and messaging are in the header) */}
              {SHOW_LOG_AND_FOLLOW_UP && canEdit && !closed && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" leftIcon="chat-check-line" onClick={() => setPanel({ kind: "outcome", type: "call", pick: true })}>
                    Log
                  </Button>
                  <Button variant="outline" leftIcon="calendar-schedule-line" onClick={() => setPanel({ kind: "plan" })}>
                    Follow-up
                  </Button>
                </div>
              )}

              {/* The tab bar sits above, under the name; the panels scroll with everything else */}
              <TabsContent value="log" className="text-[15px]">
                <div className="space-y-4">
                  {/* Next step: a card pinned near the top while the history scrolls, coloured by how soon it's due */}
                  {(lead.planned.length > 0 || !closed) && (
                    <NextStepBar
                      lead={lead}
                      projects={projects}
                      canEdit={canEdit}
                      types={types}
                      followUps={followUps}
                      pending={pending}
                      onDone={(a) => setPanel({ kind: "outcome", type: a.type, plannedId: a.id })}
                      onPlan={(v, done) =>
                        run(
                          () => planLeadActivity(lead.code, v),
                          () => {
                            done()
                            setNotice({ tone: "success", text: "Follow-up planned." })
                          },
                        )
                      }
                      onAction={(id, v) => run(() => updatePlannedActivity(lead.code, id, v))}
                    />
                  )}
                  {/* What happened */}
                  <section aria-label="History">
                    {lead.history.length ? (
                      <ol className="relative before:absolute before:top-3.5 before:bottom-4 before:left-[calc(0.875rem-0.5px)] before:w-px before:bg-border">
                        {/* Oldest first, the latest at the bottom (it comes newest first) */}
                        {[...lead.history].reverse().map((a) => (
                          <HistoryItem key={a.id} a={a} />
                        ))}
                      </ol>
                    ) : (
                      <p className="py-6 text-center text-[15px] text-muted-foreground">Nothing yet. Calls, messages and visits show here.</p>
                    )}
                  </section>
                </div>
              </TabsContent>
              <TabsContent value="deal" className="@container text-[15px]">
                <DealTab
                  key={`${lead.status}-${dealMode}`}
                  lead={lead}
                  projects={projects}
                  canEdit={canEdit}
                  mode={dealMode}
                  onDone={(message) => {
                    setDealMode("choose")
                    setNotice({ tone: "success", text: message })
                    reload()
                    router.refresh()
                  }}
                />
              </TabsContent>
              <TabsContent value="details" className="@container text-[15px]">
                <LeadDetails lead={lead} agents={agents} me={me} access={access} canEdit={canEdit} run={run} />
              </TabsContent>
            </div>
          )}

          {dialog === "email" && lead && (
            <EmailDialog
              lead={lead}
              onClose={() => setDialog(null)}
              onSent={() => {
                setDialog(null)
                setNotice({ tone: "success", text: `Email sent to ${lead.email}. It's on the timeline.` })
                reload()
                router.refresh()
              }}
            />
          )}
          {archiving && lead && <ArchiveDialog name={lead.name} pending={pending} onClose={() => setArchiving(false)} onConfirm={(note) => archive(true, note)} />}
          {changing && lead && (
            <StatusChangeDialog name={lead.name} status={changing} needUpdate={false} pending={pending} onClose={() => setChanging(null)} onConfirm={(v) => changeStatus(changing, { ...v, confirmed: true })} />
          )}
        </ScrollView>
        {/* Log composer, pinned under the history: a slim bar until clicked, then the full form.
            Call / WhatsApp in the header and "Done" on a planned follow-up open it too. */}
        {lead && canEdit && (!closed || panel?.statusTo) && tab === "log" && (
          <div className={cn("shrink-0 border-t", panel?.kind === "outcome" ? "bg-muted/60 dark:bg-muted/50" : "bg-background px-5 py-3 sm:px-6")}>
            {panel?.kind === "outcome" ? (
              <ScrollView className="max-h-[55svh]">
                <OutcomeCard
                  key={`${panel.type}-${panel.plannedId ?? ""}-${panel.statusTo ?? ""}`}
                  statusTo={panel.statusTo}
                  onClearStatus={() => setPanel((p) => ({ ...p, statusTo: undefined }))}
                  title={panel.plannedId ? `${types.label(panel.type)} done: how did it go?` : `${panel.pick ? "What happened?" : `${types.label(panel.type)}: how did it go?`}`}
                  type={panel.type}
                  onType={(t) => setPanel((p) => ({ ...p, type: t }))}
                  pending={pending}
                  onCancel={() => setPanel(null)}
                  onSave={(v) =>
                    run(
                      () => {
                        // The voice note travels as FormData; the rest as plain values
                        const { voice, ...rest } = v
                        let form = null
                        if (voice) {
                          form = new FormData()
                          form.append("voice", new File([voice.blob], `voice-note.${voice.type.includes("mp4") ? "m4a" : voice.type.includes("ogg") ? "ogg" : "webm"}`, { type: voice.type }))
                        }
                        return panel.plannedId ? updatePlannedActivity(lead.code, panel.plannedId, { action: "done", ...rest }, form) : logLeadActivity(lead.code, { type: panel.type, ...rest }, form)
                      },
                      () => {
                        setPanel(null)
                        setNotice({ tone: "success", text: v.statusTo ? "Saved, and the status is updated." : v.next ? "Saved, and the next follow-up is planned." : "Saved." })
                        if (v.outcome === "not-interested" && !v.statusTo) changeStatus("lost")
                      },
                    )
                  }
                />
              </ScrollView>
            ) : (
              <button
                type="button"
                onClick={() => setPanel({ kind: "outcome", type: "call", pick: true })}
                className="group relative flex h-12 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.025] px-2.5 text-left text-base text-muted-foreground shadow-xs transition outline-none hover:-translate-y-px hover:border-primary/35 hover:text-foreground hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-primary/[0.05]"
              >
                {/* Main action for agents: a soft sheen every few seconds and a breathing icon (off with reduced motion) */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/[0.06] to-transparent motion-safe:animate-[cta-sheen_5s_ease-in-out_infinite] motion-reduce:hidden"
                />
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary motion-safe:animate-[cta-breathe_3.2s_ease-in-out_infinite]">
                  <Icon name="chat-check-line" className="text-lg" />
                </span>
                <span className="relative flex-1 font-medium">Log a call, message or visit…</span>
                <Icon name="arrow-up-s-line" className="relative text-xl text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
              </button>
            )}
          </div>
        )}
      </BaseTabs>
    </>
  )

  if (docked)
    return (
      <section
        aria-label={lead ? `Lead: ${lead.name}` : "Lead"}
        className="@container flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background text-[15px] shadow-xs"
        onKeyDown={(e) => e.key === "Escape" && !e.defaultPrevented && onClose()}
      >
        {content}
      </section>
    )
  if (modal)
    return (
      <BaseDialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent showCloseButton={false} className="@container flex h-[min(88svh,56rem)] flex-col gap-0 overflow-hidden bg-background p-0 text-[15px] sm:max-w-[min(56rem,calc(100%-4rem))]">
          {content}
        </DialogContent>
      </BaseDialog>
    )
  return (
    <Sheet open modal={false} disablePointerDismissal onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        overlay={false}
        showCloseButton={false}
        className="@container z-20 gap-0 bg-background p-0 text-[15px] shadow-xl data-[side=right]:top-14! data-[side=right]:h-auto! data-[side=right]:w-full data-[side=right]:sm:w-[min(46rem,92vw)] data-[side=right]:sm:max-w-none data-[side=right]:lg:w-[min(46rem,55vw)]"
      >
        {content}
      </SheetContent>
    </Sheet>
  )
}

// Write an email to the lead; it goes out from the workspace's own address (Settings › Email)
function EmailDialog({ lead, onClose, onSent }) {
  const [form, setForm] = useState({ subject: "", message: `Dear ${lead.name.split(" ")[0]},\n\n` })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
  }
  const send = (e) => {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const r = await sendLeadEmail(lead.code, form)
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else onSent()
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-xl"
      title={`Email ${lead.name}`}
      description={`To ${lead.email}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lead-email-form" leftIcon="send-plane-line" loading={pending}>
            Send
          </Button>
        </>
      }
    >
      <form id="lead-email-form" onSubmit={send} noValidate className="space-y-4 p-px">
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Subject" required autoFocus value={form.subject} onChange={(e) => set({ subject: e.target.value })} error={errors.subject} />
        <div>
          <QuickReplies className="mb-2" onPick={(t) => set({ message: addLine(form.message, t) })} />
          <Textarea label="Message" required rows={9} value={form.message} onChange={(e) => set({ message: e.target.value })} error={errors.message} />
        </div>
      </form>
    </Dialog>
  )
}

// Round call / WhatsApp / email button in the lead header. A link when href is given.
function ContactIcon({ icon, label, href, external = false, tone, onClick }) {
  const cls = cn(
    "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    tone === "green" ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400" : "bg-primary/10 text-primary hover:bg-primary/20",
  )
  const inner = <Icon name={icon} />
  return href ? (
    <a href={href} aria-label={label} title={label} onClick={onClick} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {inner}
    </a>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

// How urgent the next step is: soon (next 24h) blue, just overdue (up to a day) orange, later red
const URGENCY = {
  soon: { color: "#2563eb" },
  late: { color: "#ea580c" },
  "very-late": { color: "#dc2626" },
}
function urgencyOf(at) {
  const mins = (new Date(at).getTime() - Date.now()) / 60_000
  if (mins < -24 * 60) return "very-late"
  if (mins < 0) return "late"
  if (mins <= 24 * 60) return "soon"
  return null
}
// "Due in 2h 15m" · "40m overdue" · "3 days overdue" (null when it's further off)
function countdown(at) {
  const mins = Math.round((new Date(at).getTime() - Date.now()) / 60_000)
  const span = (m) => {
    const a = Math.abs(m)
    if (a < 60) return `${Math.max(1, a)}m`
    if (a < 24 * 60) return `${Math.floor(a / 60)}h${a % 60 ? ` ${a % 60}m` : ""}`
    const d = Math.floor(a / (24 * 60))
    return `${d} day${d === 1 ? "" : "s"}`
  }
  if (mins < 0) return `${span(mins)} overdue`
  if (mins <= 24 * 60) return `in ${span(mins)}`
  return null
}
// "today at 3:00 PM" · "tomorrow at 11:00 AM" · "yesterday at 11:35 PM" · "on Sat 10 Oct at 11:00 AM" (Pakistan time)
function dueWhen(at) {
  const d = new Date(at)
  const pk = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(x)
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" }).format(d)
  const day = { [pk(new Date())]: "today", [pk(new Date(Date.now() + 86_400_000))]: "tomorrow", [pk(new Date(Date.now() - 86_400_000))]: "yesterday" }[pk(d)]
  return `${day ?? `on ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short" }).format(d)}`} at ${time}`
}

// The next planned step, a slim two-line bar under the tabs, coloured by urgency: Done, or
// move / remove it from ⋯
function NextStepBar({ lead, projects, canEdit, types, followUps, pending, onDone, onPlan, onAction }) {
  const [planning, setPlanning] = useState(false) // "Plan one" turns the bar into the planner
  // Re-check every minute so "Due in…" and the colour stay current while the panel is open
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const a = lead.planned[0]
  if (!a)
    return planning ? (
      <div className="sticky top-3 z-30 rounded-xl border bg-background px-4 py-3 shadow-sm" style={{ borderColor: "color-mix(in oklab, var(--primary) 45%, var(--background))" }}>
        <PlanInline lead={lead} projects={projects} pending={pending} onCancel={() => setPlanning(false)} onSave={(v) => onPlan(v, () => setPlanning(false))} />
      </div>
    ) : (
      <div
        className="sticky top-3 z-30 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] text-muted-foreground shadow-sm"
        style={{ borderColor: "color-mix(in oklab, #f59e0b 55%, var(--background))", backgroundColor: "color-mix(in oklab, #f59e0b 6%, var(--background))" }}
      >
        <Icon name="alarm-warning-line" className="text-base text-amber-500" /> No follow-up planned.
        {canEdit && (
          <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => setPlanning(true)}>
            Plan one
          </button>
        )}
      </div>
    )
  const level = urgencyOf(a.at)
  const c = URGENCY[level]?.color
  const overdue = level === "late" || level === "very-late"
  const pill = countdown(a.at)
  const typeColor = toHex(types.map[a.type]?.color) ?? "#2563eb"
  const extra = [a.project?.name, a.notes].filter(Boolean).join(" · ")
  // The due time opens what can be done with it: move it, no-show (visits), remove
  const options = [
    { type: "label", label: "Move to" },
    ...followUps.options.map((p) => ({
      label: p.label,
      icon: <Icon name={followUps.map[p.value]?.icon ?? "calendar-line"} style={{ color: toHex(followUps.map[p.value]?.color) ?? undefined }} />,
      onClick: () => onAction(a.id, { action: "reschedule", next: p.value }),
    })),
    { type: "separator" },
    ...(a.type === "site-visit" ? [{ label: "Didn't come (no-show)", icon: "user-unfollow-line", onClick: () => onAction(a.id, { action: "missed", notes: "No-show" }) }] : []),
    { label: "Remove", icon: "delete-bin-6-line", variant: "destructive", onClick: () => onAction(a.id, { action: "cancel" }) },
  ]
  const due = (
    <span className="font-semibold tabular-nums" style={c ? { color: c } : undefined}>
      {dueWhen(a.at)}
    </span>
  )
  return (
    <div
      className="sticky top-3 z-30 flex items-center gap-3 overflow-hidden rounded-xl border bg-background px-4 py-3 shadow-sm"
      style={{
        // A coloured outline: the urgency colour when it's due soon or late, else the activity's colour (softer)
        borderColor: c ? `color-mix(in oklab, ${c} 55%, var(--background))` : `color-mix(in oklab, ${typeColor} 35%, var(--border))`,
        ...(c && { backgroundColor: `color-mix(in oklab, ${c} 7%, var(--background))` }),
      }}
    >
      <div className="min-w-0 flex-1">
        {/* Follow up [📞 Call] is due [today at 3:00 PM ▾] */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]">
          <span className="text-muted-foreground">Follow up</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[14px] font-semibold" style={{ color: typeColor, backgroundColor: `color-mix(in oklab, ${typeColor} 14%, var(--background))` }}>
            <Icon name={types.map[a.type]?.icon ?? "calendar-line"} className="text-[14px]" />
            {types.label(a.type)}
          </span>
          <span className="text-muted-foreground">{overdue ? "was due" : "is due"}</span>
          {canEdit ? (
            <DropdownMenu
              align="start"
              items={options}
              trigger={
                <button
                  type="button"
                  aria-label={`Due ${dueWhen(a.at)}: move or remove`}
                  className="inline-flex cursor-pointer items-center gap-0.5 rounded-md underline decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"
                  style={c ? { textDecorationColor: c } : undefined}
                >
                  {due}
                  <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
                </button>
              }
            />
          ) : (
            due
          )}
          {pill && (
            <span className="rounded-full px-2 py-px text-[12px] font-semibold whitespace-nowrap" style={{ color: c, backgroundColor: `color-mix(in oklab, ${c} 16%, var(--background))` }}>
              {pill}
            </span>
          )}
          {lead.planned.length > 1 && <span className="text-[12px] text-muted-foreground">+{lead.planned.length - 1} more</span>}
        </p>
        {extra && (
          <p className="mt-1 truncate text-[13px] text-muted-foreground" title={extra}>
            {extra}
          </p>
        )}
      </div>
      {canEdit && (
        <Tooltip content="Mark done">
          <button
            type="button"
            aria-label="Mark done"
            onClick={() => onDone(a)}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-600 dark:bg-emerald-950 transition outline-none hover:bg-emerald-500 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-emerald-400 dark:hover:text-white"
          >
            <Icon name="check-line" />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

// Just the log form in a small dialog, for moving a lead on the board when the workspace asks for
// a note with every status change. Saves the activity and the move together.
//   <LogDialog code="LD-00012" name="Ali Raza" statusTo="interested" onClose={…} onSaved={…} />
//   planned: { id, type } to complete a planned follow-up / visit / meeting (Follow-ups, Site
//   visits and Meetings pages) instead of logging something new
export function LogDialog({ code, name, statusTo, planned, onClose, onSaved }) {
  const types = useList("activity-type")
  const [type, setType] = useState(planned?.type ?? "call")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const save = (v) =>
    startTransition(async () => {
      setError("")
      const { voice, ...rest } = v
      let form = null
      if (voice) {
        form = new FormData()
        form.append("voice", new File([voice.blob], `voice-note.${voice.type.includes("mp4") ? "m4a" : voice.type.includes("ogg") ? "ogg" : "webm"}`, { type: voice.type }))
      }
      const r = planned ? await updatePlannedActivity(code, planned.id, { action: "done", ...rest }, form) : await logLeadActivity(code, { type, ...rest }, form)
      if (r?.error) setError(r.error)
      else onSaved?.()
    })
  return (
    <BaseDialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 text-[15px] sm:max-w-xl">
        <div className="flex items-center gap-2 border-b px-5 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">{name}</DialogTitle>
            <DialogDescription className="text-[13px]">{planned ? `${types.label(planned.type)} done: how did it go?` : "Log what happened to move this lead"}</DialogDescription>
          </div>
          <IconButton icon="close-line" size="sm" aria-label="Close" onClick={onClose} />
        </div>
        {error && (
          <div className="px-5 pt-3 sm:px-6">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <div className="bg-muted/60 dark:bg-muted/50">
          <OutcomeCard
            title={planned ? `${types.label(type)}: how did it go?` : `Move ${name}`}
            type={type}
            onType={setType}
            pending={pending}
            statusTo={statusTo}
            onClearStatus={onClose}
            onCancel={onClose}
            onSave={save}
          />
        </div>
      </DialogContent>
    </BaseDialog>
  )
}
