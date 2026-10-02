"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton, iconButtonVariants } from "@/components/ui/icon-button"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Tooltip } from "@/components/ui/tooltip"
import { interestText } from "../constants"
import { updatePlannedActivity } from "../server/leads"
import { TempIcon, dueText, telHref, whatsappHref } from "./lead-parts"
import { LogDialog } from "./lead-dialog"

// Follow-ups and Site visits: the planned activities on leads, as lists to work through
// (like the Vite app). Done / Visited, no-show and reschedule act on the activity; the name opens
// the lead. Data: plannedWork() (server/queries.js).

const DAY = 86_400_000
const pkDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d))
const time = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d))

// Reschedule (Lists & Labels › Follow-up options) and, for visits, no-show straight away; Done
// opens the log form (how it went, notes, voice note, next follow-up) in a modal
function useActions() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState(null)
  const [logging, setLogging] = useState(null) // the planned item being marked done
  const act = (a, input, done) =>
    startTransition(async () => {
      const r = await updatePlannedActivity(a.lead.code, a.id, input)
      setNotice(r?.error ? { tone: "error", text: r.error } : { tone: "success", text: done })
      router.refresh()
    })
  const logDialog = logging && (
    <LogDialog
      code={logging.lead.code}
      name={logging.lead.name}
      planned={{ id: logging.id, type: logging.type }}
      onClose={() => setLogging(null)}
      onSaved={() => {
        setNotice({ tone: "success", text: `Saved: ${logging.lead.name}.` })
        setLogging(null)
        router.refresh()
      }}
    />
  )
  return { pending, notice, act, log: setLogging, logDialog }
}

// A done (or missed) item: who, when, how it went
function DoneRow({ a, visit }) {
  const types = useList("activity-type")
  const outcomes = useList("activity-outcome")
  const missed = a.status === "missed"
  const outcome = a.outcome ? outcomes.map[a.outcome] : null
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-base", missed ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
        <Icon name={missed ? "user-unfollow-line" : "check-line"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/crm/leads?lead=${urlCode(a.lead.code)}`} className="font-medium hover:text-primary">
            {a.lead.name}
          </Link>
          <span className={cn("text-[13px]", missed ? "text-muted-foreground" : "font-medium text-emerald-700 dark:text-emerald-400")}>{missed ? (visit ? "Didn't show up" : "Missed") : "Done"}</span>
          <span className="text-[13px] text-muted-foreground">
            {!visit && `${types.label(a.type)} · `}
            {a.doneAt ? timeAgo(a.doneAt) : time(a.at)}
            {a.by && ` · ${a.by.name}`}
          </span>
        </div>
        {(outcome || a.notes || (visit && a.project)) && (
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            {outcome && (
              <span className="flex shrink-0 items-center gap-1" style={{ color: toHex(outcome.color) }}>
                {outcome.icon && <Icon name={outcome.icon} />}
                {outcome.label}
              </span>
            )}
            <span className="truncate">{[visit && a.project?.name, a.notes].filter(Boolean).join(" · ")}</span>
          </p>
        )}
      </div>
    </li>
  )
}

//   visit: a site visit or meeting (by day: no type shown, project instead, no-show); doneLabel: its Done button
function Row({ a, now, timeOnly, visit, doneLabel = "Done", canEdit, act, log, pending }) {
  const types = useList("activity-type")
  const followUps = useList("follow-up")
  const unitTypes = useList("unit-type")
  const due = dueText(a.at, now)
  const type = types.map[a.type]
  const subtitle = visit ? [a.project?.name, a.notes].filter(Boolean).join(" · ") : [a.notes, interestText(a.lead.interest, { typeLabel: unitTypes.label }).replace(/^—$/, "")].filter(Boolean).join(" · ")
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-base", due.overdue ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-primary/10 text-primary")}>
        <Icon name={type?.icon ?? "calendar-event-line"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/crm/leads?lead=${urlCode(a.lead.code)}`} className="font-medium hover:text-primary">
            {a.lead.name}
          </Link>
          <TempIcon priority={a.lead.priority} />
          <span className={cn("text-[13px]", due.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {!visit && `${type?.label ?? a.type} · `}
            {timeOnly && !due.overdue ? time(a.at) : due.text}
          </span>
        </div>
        {subtitle && <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {a.by && (
        <Tooltip content={a.by.name}>
          <span>
            <Avatar name={a.by.name} source={a.by.avatarUrl} size="sm" />
          </span>
        </Tooltip>
      )}
      <div className="flex items-center gap-1">
        <a href={telHref(a.lead.phone)} aria-label={`Call ${a.lead.name}`} title="Call" className={iconButtonVariants()}>
          <Icon name="phone-line" />
        </a>
        {a.lead.whatsapp && (
          <a
            href={whatsappHref(a.lead.phone, a.lead.name)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${a.lead.name}`}
            title="WhatsApp"
            className={cn(iconButtonVariants(), "text-emerald-600 dark:text-emerald-400")}
          >
            <Icon name="whatsapp-line" />
          </a>
        )}
        {canEdit && (
          <>
            <Button size="sm" variant="outline" leftIcon="check-line" disabled={pending} onClick={() => log(a)}>
              {doneLabel}
            </Button>
            <DropdownMenu
              align="end"
              items={[
                { type: "label", label: "Move to" },
                ...followUps.options.map((o) => ({
                  key: o.value,
                  label: o.label,
                  icon: followUps.map[o.value]?.icon ?? "calendar-event-line",
                  onClick: () => act(a, { action: "reschedule", next: o.value }, `${a.lead.name}: moved to ${o.label.toLowerCase()}.`),
                })),
                ...(visit
                  ? [
                      { type: "separator" },
                      {
                        label: "Didn't show up",
                        icon: "user-unfollow-line",
                        variant: "destructive",
                        onClick: () => act(a, { action: "missed", notes: "Didn't show up" }, `${a.lead.name}: marked as a no-show.`),
                      },
                    ]
                  : []),
              ]}
              trigger={<IconButton icon="more-2-line" variant="ghost" aria-label="Reschedule" tooltip={false} disabled={pending} />}
            />
          </>
        )}
      </div>
    </li>
  )
}

function Section({ title, count, tone, children }) {
  return (
    <section>
      <h2 className={cn("mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase", tone)}>
        {title} · {count}
      </h2>
      <ul className="divide-y rounded-xl border bg-background shadow-xs">{children}</ul>
    </section>
  )
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-background py-16 text-center">
      <Icon name={icon} className="text-3xl text-muted-foreground" />
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

// Follow-ups: overdue, today, tomorrow, this week, later. Agents start on theirs.
const BUCKETS = [
  { key: "overdue", label: "Overdue", tone: "text-red-600 dark:text-red-400" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
]
function bucket(at, now) {
  const t = new Date(at).getTime()
  if (t < now) return "overdue"
  const day = pkDay(at)
  if (day === pkDay(now)) return "today"
  if (day === pkDay(now + DAY)) return "tomorrow"
  if (t < now + 7 * DAY) return "week"
  return "later"
}

export function FollowUpsView({ items, me, scope, canEdit }) {
  const [now] = useState(() => Date.now())
  const [mine, setMine] = useState(scope === "own" ? "all" : "mine")
  const { pending, notice, act, log, logDialog } = useActions()
  const theirs = items.filter((a) => mine === "all" || a.by?.id === me)
  const shown = theirs.filter((a) => a.status === "planned")
  const done = theirs.filter((a) => a.status !== "planned").sort((x, y) => new Date(y.doneAt ?? y.at) - new Date(x.doneAt ?? x.at))
  const groups = BUCKETS.map((b) => ({ ...b, items: shown.filter((a) => bucket(a.at, now) === b.key) }))
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Follow-ups"
        description={`${groups[0].items.length} overdue · ${groups[1].items.length} today`}
        actions={
          scope !== "own" && (
            <ToggleGroup
              aria-label="Whose"
              value={mine}
              onChange={(v) => v && setMine(v)}
              options={[
                { value: "mine", label: "Mine" },
                { value: "all", label: scope === "team" ? "My team" : "Everyone" },
              ]}
            />
          )
        }
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <ScrollView className="min-h-0 flex-1" viewportClassName="space-y-5 pb-2">
        {!shown.length && <EmptyState icon="check-double-line" title={done.length ? "All caught up" : "No follow-ups planned"} text="Plan the next step from a lead's follow-up bar." />}
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <Section key={g.key} title={g.label} count={g.items.length} tone={g.tone}>
              {g.items.map((a) => (
                <Row key={a.id} a={a} now={now} timeOnly={g.key === "today" || g.key === "tomorrow"} canEdit={canEdit} act={act} log={log} pending={pending} />
              ))}
            </Section>
          ))}
        {done.length > 0 && (
          <Section title="Done · last 30 days" count={done.length} tone="text-emerald-700 dark:text-emerald-400">
            {done.map((a) => (
              <DoneRow key={a.id} a={a} />
            ))}
          </Section>
        )}
      </ScrollView>
      {logDialog}
    </div>
  )
}

// Site visits and office meetings: by day, a project filter, and how many turned up in the last 30 days
const BY_DAY = {
  "site-visits": {
    title: "Site visits",
    description: "Customers coming to see the project, by day",
    icon: "map-pin-user-line",
    done: "Visited",
    empty: "No visits planned",
    noun: "visits",
  },
  meetings: {
    title: "Meetings",
    description: "Customers coming to the office, by day",
    icon: "team-line",
    done: "Met",
    empty: "No meetings planned",
    noun: "meetings",
  },
}

export function SiteVisitsView(props) {
  return <ByDayView kind="site-visits" {...props} />
}
export function MeetingsView(props) {
  return <ByDayView kind="meetings" {...props} />
}

function ByDayView({ kind, items, projects, canEdit }) {
  const k = BY_DAY[kind]
  const [now] = useState(() => Date.now())
  const [project, setProject] = useState("")
  const { pending, notice, act, log, logDialog } = useActions()
  const view = useMemo(() => {
    const inProject = items.filter((v) => !project || v.project?.code === project)
    const upcoming = inProject.filter((v) => v.status === "planned")
    const days = new Map()
    for (const v of upcoming) days.set(pkDay(v.at), [...(days.get(pkDay(v.at)) ?? []), v])
    const done = inProject.filter((v) => v.status === "done").length
    const missed = inProject.filter((v) => v.status === "missed").length
    return {
      days: [...days.entries()],
      finished: inProject.filter((v) => v.status !== "planned").sort((x, y) => new Date(y.doneAt ?? y.at) - new Date(x.doneAt ?? x.at)),
      today: upcoming.filter((v) => pkDay(v.at) === pkDay(now)).length,
      overdue: upcoming.filter((v) => new Date(v.at).getTime() < now && pkDay(v.at) !== pkDay(now)).length,
      week: upcoming.filter((v) => new Date(v.at).getTime() - now < 7 * DAY).length,
      done,
      missed,
      showRate: done + missed ? Math.round((done / (done + missed)) * 100) : null,
    }
  }, [items, project, now])
  const dayTitle = (d) => (d === pkDay(now) ? "Today" : d === pkDay(now + DAY) ? "Tomorrow" : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T00:00:00`)))

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={k.title}
        description={k.description}
        actions={<Select aria-label="Project" className="w-56" value={project} onChange={setProject} options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon={k.icon} label="Today" value={view.today} hint={view.overdue ? `${view.overdue} past and not marked` : `${k.noun[0].toUpperCase()}${k.noun.slice(1)} planned`} />
        <StatTile icon="calendar-2-line" label="Next 7 days" value={view.week} hint="Including today" />
        <StatTile icon="user-follow-line" tone="green" label={`${k.done} (30 days)`} value={view.done} hint={`Completed ${k.noun}`} />
        <StatTile
          icon="user-unfollow-line"
          tone={view.showRate != null && view.showRate < 70 ? "red" : "amber"}
          label="Show-up rate"
          value={view.showRate == null ? "—" : `${view.showRate}%`}
          hint={`${view.missed} no-shows in 30 days`}
        />
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <ScrollView className="min-h-0 flex-1" viewportClassName="space-y-5 pb-2">
        {!view.days.length && !view.finished.length && <EmptyState icon={k.icon} title={k.empty} text={`Plan ${k.noun} from a lead's follow-up bar.`} />}
        {view.days.map(([day, visits]) => (
          <Section key={day} title={dayTitle(day)} count={visits.length}>
            {visits.map((v) => (
              <Row key={v.id} a={v} now={now} timeOnly visit doneLabel={k.done} canEdit={canEdit} act={act} log={log} pending={pending} />
            ))}
          </Section>
        ))}
        {view.finished.length > 0 && (
          <Section title="Done · last 30 days" count={view.finished.length} tone="text-emerald-700 dark:text-emerald-400">
            {view.finished.map((v) => (
              <DoneRow key={v.id} a={v} visit />
            ))}
          </Section>
        )}
      </ScrollView>
      {logDialog}
    </div>
  )
}
