"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { TimePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { useList } from "@/modules/lookups/context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { ALL_DAYS, WEEKDAYS, longDay, shiftTime, shortName } from "../roster"
import { checkCover, markAttendance, removePattern, savePattern, savePost, setCellOverride, setPostActive } from "../server/roster-actions"

// Pieces of the duty roster: people chips, the cell dialog (attendance, take off, add cover),
// regular duties and post dialogs.

export const STATUS = {
  on: { label: "On duty", className: "bg-muted text-foreground" },
  present: { label: "Present", className: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300", icon: "check-line" },
  late: { label: "Late", className: "bg-amber-500/15 text-amber-900 dark:text-amber-200", icon: "time-line" },
  absent: { label: "Absent", className: "bg-red-500/12 text-red-700 line-through dark:text-red-300", icon: "close-line" },
  leave: { label: "On leave", className: "bg-sky-500/10 text-sky-800/70 line-through dark:text-sky-300/70", icon: "plane-line" },
  unmarked: { label: "Not marked", className: "border border-dashed border-muted-foreground/30 text-muted-foreground", icon: "question-line" },
}

export const MARK_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
]

export function PersonChip({ person, full = false, className }) {
  const s = STATUS[person.status] ?? STATUS.on
  return (
    <span
      className={cn("inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-xs leading-none", s.className, className)}
      title={`${person.name} · ${person.status === "leave" && person.leaveType ? `On ${person.leaveType.toLowerCase()}` : s.label}${person.cover ? " · cover for the day" : ""}`}
    >
      {s.icon && <Icon name={s.icon} className="shrink-0 text-[12px] no-underline" />}
      <span className="truncate">{full ? person.name : shortName(person.name)}</span>
      {person.cover && <Icon name="swap-line" className="shrink-0 text-[12px] text-primary" aria-label="Cover" />}
    </span>
  )
}

export function ShortBadge({ n, className }) {
  return n > 0 ? (
    <Badge color="red" className={className}>
      {n} short
    </Badge>
  ) : null
}

export function KindIcon({ kind, className }) {
  const kinds = useList("post-kind")
  return <Icon name={kinds.map[kind]?.icon ?? "map-pin-line"} className={className} />
}

// Mark people for a day; errors as a toast → the action's result
export async function mark(date, list) {
  const r = await markAttendance(date, list)
  if (r?.error) toast.error(r.error)
  else if (r?.fieldErrors) toast.error("That didn't work. Reload and try again.")
  return r
}

// ---------- one post, shift and day ----------

// open: { post, shift, cell } from the week · staff: [{ code, name, designation }] for cover
export function CellDialog({ post, shift, cell, staff, today, onClose }) {
  const router = useRouter()
  const designations = useList("designation")
  const [pick, setPick] = useState(null)
  const [check, setCheck] = useState(null) // { for, warnings }
  const [busy, startTransition] = useTransition()
  const canMark = cell.date <= today
  const on = new Set(cell.people.map((p) => p.code))
  const base = { date: cell.date, post: post.code, shift: shift.key }

  // Why adding this person might be a problem (leave, double shift, day off)
  useEffect(() => {
    if (!pick) return
    let live = true
    checkCover({ ...base, employee: pick }).then((r) => live && setCheck({ for: pick, warnings: r?.warnings ?? [] }))
    return () => {
      live = false
    }
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps
  const warnings = check?.for === pick ? check.warnings : null

  const run = (fn) =>
    startTransition(async () => {
      const r = await fn()
      if (r?.ok) router.refresh()
    })
  const change = (p, action) =>
    run(() =>
      toastAction(() => setCellOverride({ ...base, employee: p.code, action }), {
        loading: "Saving…",
        success: (r) => (action === "add" ? `${p.name} is covering ${post.name} (${shift.label.toLowerCase()}).${r.warning ? ` ${r.warning}` : ""}` : `${p.name} is off ${post.name} for the day.`),
      }).then((r) => {
        if (r?.ok && action === "add") setPick(null)
        return r
      }),
    )
  const picked = staff.find((s) => s.code === pick)

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-xl"
      title={`${post.name} · ${shift.label}`}
      description={`${longDay(cell.date)} · ${shiftTime(shift)} · needs ${cell.needed}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y rounded-xl border">
          {cell.people.map((p) => (
            <li key={p.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[designations.label(p.designation), p.cover && "covering today", p.status === "leave" && `on ${(p.leaveType ?? "leave").toLowerCase()}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              {p.status === "leave" ? (
                <PersonChip person={{ ...p, name: "On leave", cover: false }} full />
              ) : canMark ? (
                <ToggleGroup
                  aria-label={`Attendance for ${p.name}`}
                  className="h-8"
                  value={MARK_OPTIONS.some((o) => o.value === p.status) ? p.status : ""}
                  onChange={(v) => run(() => mark(cell.date, [{ employee: p.code, status: v }]))}
                  options={MARK_OPTIONS}
                />
              ) : null}
              <IconButton icon="user-unfollow-line" aria-label={p.cover ? `Remove ${p.name}'s cover` : `Take ${p.name} off this shift for the day`} disabled={busy} onClick={() => change(p, "remove")} />
            </li>
          ))}
          {!cell.people.length && <li className="px-3 py-5 text-center text-sm text-muted-foreground">Nobody on this shift.</li>}
        </ul>
        {cell.short > 0 && (
          <p className="flex items-center gap-2 rounded-lg bg-red-500/8 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            <Icon name="error-warning-line" /> {cell.short} short. Add cover below.
          </p>
        )}
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <Combobox
            label="Add cover for this day"
            placeholder="Search staff…"
            options={staff.filter((e) => !on.has(e.code)).map((e) => ({ value: e.code, label: e.name, description: designations.label(e.designation) || undefined }))}
            value={pick}
            onChange={(v) => setPick(v ?? null)}
          />
          {pick && warnings == null && <p className="text-xs text-muted-foreground">Checking their day…</p>}
          {warnings?.length > 0 && (
            <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
              {warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <Icon name="alert-line" className="mt-px shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          {warnings?.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <Icon name="check-line" /> Free that day.
            </p>
          )}
          <Button size="sm" leftIcon="user-add-line" disabled={!pick || busy} onClick={() => change(picked, "add")}>
            {warnings?.length ? "Add anyway" : "Add to this shift"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// ---------- weekday toggles ----------

export function DayToggles({ value, onChange, label = "Days" }) {
  const set = new Set(value)
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {WEEKDAYS.map((d) => (
        <button
          key={d.value}
          type="button"
          aria-pressed={set.has(d.value)}
          aria-label={d.label}
          onClick={() => onChange(set.has(d.value) ? value.filter((x) => x !== d.value) : [...value, d.value])}
          className={cn("h-8 w-11 cursor-pointer rounded-md border text-xs font-medium transition-colors", set.has(d.value) ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        >
          {d.short}
        </button>
      ))}
    </div>
  )
}

// ---------- someone's regular duties ----------

const blankDuty = (posts) => ({ post: posts[0]?.code ?? "", shiftKey: posts[0]?.shifts[0]?.key ?? "", days: [1, 2, 3, 4, 5, 6], rotate: false, weeks: "" })
const WEEK_OPTIONS = [
  { value: "", label: "Every week" },
  { value: "odd", label: "Odd weeks only" },
  { value: "even", label: "Even weeks only" },
]

// employee: { code, name, duties } · posts: active posts
export function PatternDialog({ employee, posts, onClose }) {
  const router = useRouter()
  const initial = useMemo(() => (employee.duties.length ? employee.duties.map((d) => ({ ...d, weeks: d.weeks ?? "" })) : [blankDuty(posts)]), [employee, posts])
  const [duties, setDuties] = useState(initial)
  const [errors, setErrors] = useState({})
  const [busy, startTransition] = useTransition()
  const dirty = JSON.stringify(duties) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const setDuty = (i, p) => setDuties((x) => x.map((d, j) => (j === i ? { ...d, ...p } : d)))

  const close = async () => {
    if (dirty && !(await confirm({ title: "Discard unsaved changes?", description: `Your changes to ${employee.name}'s duties will be lost.`, confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true })))
      return
    onClose()
  }
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => savePattern(employee.code, duties), { loading: "Saving…", success: `${employee.name}'s regular duties are saved.` })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      if (r?.ok) {
        onClose()
        router.refresh()
      }
    })
  const takeOff = async () => {
    if (
      !(await confirm({
        title: `Take ${employee.name} off the roster?`,
        description: "Their regular duties are removed and they count as office staff (Monday to Saturday). Past attendance stays.",
        confirmLabel: "Take off the roster",
        destructive: true,
      }))
    )
      return
    startTransition(async () => {
      const r = await toastAction(() => removePattern(employee.code), { loading: "Saving…", success: `${employee.name} is off the roster.` })
      if (r?.ok) {
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      scrollable
      className="sm:max-w-2xl"
      title={`${employee.name}'s regular duties`}
      description="The week repeats. Leave, cover and one-day changes are made on the roster itself."
      footer={
        <>
          {employee.duties.length > 0 && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={busy} onClick={takeOff}>
              Take off the roster
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!posts.length} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {!posts.length && <p className="text-sm text-muted-foreground">Add a duty post first (Posts tab).</p>}
      {duties.map((d, i) => {
        const post = posts.find((p) => p.code === d.post)
        const keys = post?.shifts.map((s) => s.key) ?? []
        const canRotate = keys.includes("day") && keys.includes("night") && ["day", "night"].includes(d.shiftKey)
        return (
          <div key={i} className="space-y-3 rounded-xl border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Select
                label="Post"
                value={d.post}
                error={errors[`${i}.post`]}
                onChange={(v) => setDuty(i, { post: v, shiftKey: posts.find((p) => p.code === v)?.shifts[0]?.key ?? "", rotate: false })}
                options={posts.map((p) => ({ value: p.code, label: p.project ? `${p.name} · ${p.project}` : p.name }))}
              />
              <Select
                label="Shift"
                value={d.shiftKey}
                error={errors[`${i}.shiftKey`]}
                onChange={(v) => setDuty(i, { shiftKey: v })}
                options={(post?.shifts ?? []).map((s) => ({ value: s.key, label: `${s.label} · ${shiftTime(s)}` }))}
              />
              <div className="self-end">{duties.length > 1 && <IconButton icon="delete-bin-6-line" aria-label="Remove this duty" onClick={() => setDuties((x) => x.filter((_, j) => j !== i))} />}</div>
            </div>
            <div>
              <DayToggles value={d.days} onChange={(days) => setDuty(i, { days })} />
              {errors[`${i}.days`] && <p className="mt-1 text-xs text-destructive">{errors[`${i}.days`]}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Select aria-label="Which weeks" className="w-48" value={d.weeks ?? ""} onChange={(v) => setDuty(i, { weeks: v })} options={WEEK_OPTIONS} />
              {canRotate && <Checkbox label="Swap day and night every other week" checked={Boolean(d.rotate)} onChange={(v) => setDuty(i, { rotate: v })} />}
            </div>
          </div>
        )
      })}
      {posts.length > 0 && (
        <Button size="sm" variant="ghost" leftIcon="add-line" onClick={() => setDuties((x) => [...x, blankDuty(posts)])}>
          Add another duty
        </Button>
      )}
    </Dialog>
  )
}

// ---------- posts and their shifts ----------

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "shift"
// Keys for new shifts from their names, unique on the post
function withKeys(shifts) {
  const used = new Set(shifts.filter((s) => s.key).map((s) => s.key))
  return shifts.map((s) => {
    if (s.key) return s
    let key = slug(s.label)
    for (let n = 2; used.has(key); n++) key = `${slug(s.label).slice(0, 17)}-${n}`
    used.add(key)
    return { ...s, key }
  })
}
// The Select shows its placeholder for "", so head office has its own value here
const HEAD_OFFICE = "head-office"
const DAY_SHIFT = { key: "day", label: "Day", start: "08:00", end: "20:00", needed: 1, days: null }

// post: from listPosts() or null for a new one · projects: [{ code, name }]
export function PostDialog({ post, projects, onClose }) {
  const router = useRouter()
  const kinds = useList("post-kind")
  const initial = useMemo(
    () =>
      post
        ? { code: post.code, name: post.name, project: post.projectCode ?? HEAD_OFFICE, kind: post.kind, shifts: post.shifts.map((s) => ({ ...s, days: s.days ?? null })) }
        : { name: "", project: projects[0]?.code ?? HEAD_OFFICE, kind: kinds.defaultValue ?? "security", shifts: [DAY_SHIFT] },
    [post, projects, kinds.defaultValue],
  )
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [busy, startTransition] = useTransition()
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const setShift = (i, p) => set({ shifts: f.shifts.map((s, j) => (j === i ? { ...s, ...p } : s)) })

  const close = async () => {
    if (dirty && !(await confirm({ title: "Discard unsaved changes?", description: "Your changes to this post will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))) return
    onClose()
  }
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => savePost({ ...f, project: f.project === HEAD_OFFICE ? "" : f.project, shifts: withKeys(f.shifts).map((s) => ({ ...s, days: s.days?.length === 7 ? null : s.days })) }), {
        loading: "Saving…",
        success: post ? `${f.name} is saved.` : `${f.name} is on the roster. Give people regular duties there.`,
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      if (r?.ok) {
        onClose()
        router.refresh()
      }
    })
  const toggleActive = async () => {
    if (
      post.isActive &&
      !(await confirm({
        title: `Take ${post.name} off the roster?`,
        description: "It stops showing on the roster and its regular duties stop applying. You can put it back later.",
        confirmLabel: "Take off",
        destructive: true,
      }))
    )
      return
    startTransition(async () => {
      const r = await toastAction(() => setPostActive(post.code, !post.isActive), { loading: "Saving…", success: post.isActive ? `${post.name} is off the roster.` : `${post.name} is back on the roster.` })
      if (r?.ok) {
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      scrollable
      className="sm:max-w-3xl"
      title={post ? `Edit ${post.name}` : "New duty post"}
      description="A place or job that needs people on shifts: a gate, the site office, transport."
      footer={
        <>
          {post && (
            <Button variant="ghost" className={cn("mr-auto", post.isActive && "text-destructive hover:text-destructive")} disabled={busy} onClick={toggleActive}>
              {post.isActive ? "Take off the roster" : "Put back on the roster"}
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Name" value={f.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} placeholder="Main gate" />
        <Select
          label="Where"
          value={f.project}
          error={errors.project}
          onChange={(v) => set({ project: v })}
          options={[...projects.map((p) => ({ value: p.code, label: p.name })), { value: HEAD_OFFICE, label: "Head office" }]}
        />
        <LookupSelect list="post-kind" label="Kind" value={f.kind} error={errors.kind} onChange={(v) => set({ kind: v })} />
      </div>
      <p className="pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Shifts</p>
      {f.shifts.map((s, i) => {
        const days = s.days ?? ALL_DAYS
        return (
          <div key={i} className="space-y-3 rounded-xl border p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_8.5rem_8.5rem_7rem_auto]">
              <Input className="col-span-2 sm:col-span-1" label="Shift" value={s.label} error={errors[`shifts.${i}.label`]} onChange={(e) => setShift(i, { label: e.target.value })} />
              <TimePicker label="From" timeFormat="24h" clearable={false} value={s.start} error={errors[`shifts.${i}.start`]} onChange={(v) => setShift(i, { start: v })} />
              <TimePicker label="To" timeFormat="24h" clearable={false} value={s.end} error={errors[`shifts.${i}.end`]} onChange={(v) => setShift(i, { end: v })} />
              <NumberInput label="People" min={1} max={50} value={s.needed} error={errors[`shifts.${i}.needed`]} onChange={(v) => setShift(i, { needed: v ?? 1 })} />
              <div className="self-end">
                {f.shifts.length > 1 && <IconButton icon="delete-bin-6-line" aria-label={`Remove the ${s.label || "new"} shift`} onClick={() => set({ shifts: f.shifts.filter((_, j) => j !== i) })} />}
              </div>
            </div>
            <div>
              <DayToggles label="Days this shift runs" value={days} onChange={(v) => setShift(i, { days: v })} />
              {errors[`shifts.${i}.days`] && <p className="mt-1 text-xs text-destructive">{errors[`shifts.${i}.days`]}</p>}
            </div>
          </div>
        )
      })}
      {f.shifts.length < 6 && (
        <Button
          size="sm"
          variant="ghost"
          leftIcon="add-line"
          onClick={() =>
            set({
              shifts: [
                ...f.shifts,
                f.shifts.some((s) => s.key === "night") ? { label: "Evening", start: "14:00", end: "22:00", needed: 1, days: null } : { key: "night", label: "Night", start: "20:00", end: "08:00", needed: 1, days: null },
              ],
            })
          }
        >
          Add shift
        </Button>
      )}
    </Dialog>
  )
}
