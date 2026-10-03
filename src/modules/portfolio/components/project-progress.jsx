"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, timeAgo } from "@/lib/format"
import { toHex } from "@/lib/color"
import { confirm } from "@/components/alert-context"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { AssetManager } from "@/components/assets/asset-manager"
import { Lightbox } from "@/components/ui/lightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker, DateTimePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { attachUpdatePhotos, deleteEvent, deleteUpdate, saveEvent, saveProgress, saveUpdate, uploadUpdatePhoto } from "../server/progress"

// A project's development progress, updates timeline and events.

const average = (rows) => (rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : null)

// Date / date-time in Pakistan time for the pickers
const pktParts = (d) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value]),
  )
const toPktDate = (d) => {
  const p = pktParts(d)
  return `${p.year}-${p.month}-${p.day}`
}
const toPktDateTime = (d) => {
  const p = pktParts(d)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

function useSave() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [errors, setErrors] = useState({})
  const run = (fn, after) =>
    startTransition(async () => {
      setError("")
      setErrors({})
      const result = await fn()
      if (result?.fieldErrors) setErrors(result.fieldErrors)
      else if (result?.error) setError(result.error)
      else {
        after?.(result)
        router.refresh()
      }
    })
  return { run, pending, error, errors }
}

function Bar({ percent, className }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all", percent >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${percent}%` }} />
    </div>
  )
}

// ---------- progress ----------

function ProgressDialog({ project, onClose }) {
  const works = useList("development-work")
  const { run, pending, error } = useSave()
  const [scope, setScope] = useState("")
  const rowsFor = (s) => project.progress.filter((r) => String(r.phaseId ?? "") === s)
  const [values, setValues] = useState(() => Object.fromEntries(rowsFor("").map((r) => [r.work, r.percent])))
  const [note, setNote] = useState("")
  const [post, setPost] = useState(true)
  const changeScope = (s) => {
    setScope(s)
    setValues(Object.fromEntries(rowsFor(s).map((r) => [r.work, r.percent])))
  }
  // Every active work, plus any tracked one switched off since
  const list = [
    ...works.options,
    ...rowsFor(scope)
      .filter((r) => !works.options.some((o) => o.value === r.work))
      .map((r) => ({ value: r.work, label: works.label(r.work) })),
  ]
  const save = () =>
    run(
      () =>
        saveProgress(project.code, {
          phaseId: scope || null,
          items: Object.fromEntries(list.map((o) => [o.value, values[o.value] ?? null])),
          note,
          postUpdate: post,
        }),
      onClose,
    )
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-2xl"
      scrollable
      title="Update progress"
      description="Percent complete for each development work. Leave a work blank if it isn't tracked."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="save-3-line" loading={pending} onClick={save}>
            Save progress
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {project.phases.length > 1 && (
        <Select label="For" value={scope} onChange={changeScope} options={[{ value: "", label: "The whole project" }, ...project.phases.map((p) => ({ value: String(p.id), label: p.name }))]} />
      )}
      <ul className="divide-y rounded-lg border">
        {list.map((o) => {
          const v = values[o.value]
          return (
            <li key={o.value} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem]">
              <span className="flex items-center gap-2 text-sm">
                <Icon name={works.map[o.value]?.icon ?? "tools-line"} className="text-muted-foreground" />
                {o.label}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label={`${o.label} percent`}
                value={v ?? 0}
                onChange={(e) => setValues((x) => ({ ...x, [o.value]: Number(e.target.value) }))}
                className={cn("hidden w-full accent-primary sm:block", v == null && "opacity-40")}
              />
              <NumberInput
                aria-label={`${o.label} %`}
                size="sm"
                min={0}
                max={100}
                suffix="%"
                placeholder="—"
                value={v ?? null}
                onChange={(n) => setValues((x) => ({ ...x, [o.value]: n == null ? null : Math.min(100, Math.max(0, Math.round(n))) }))}
              />
            </li>
          )
        })}
      </ul>
      <Textarea label="Note" rows={2} placeholder="What happened since the last update (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Checkbox label="Post this to the updates timeline" checked={post} onChange={setPost} />
    </Dialog>
  )
}

export function ProjectProgress({ project, canEdit }) {
  const works = useList("development-work")
  const [editing, setEditing] = useState(false)
  const scopes = [{ id: null, name: "Whole project" }, ...project.phases.map((p) => ({ id: p.id, name: p.name }))]
    .map((s) => ({ ...s, rows: project.progress.filter((r) => (r.phaseId ?? null) === s.id) }))
    .filter((s) => s.rows.length)
  const overall = average(project.progress.filter((r) => r.phaseId == null)) ?? average(project.progress)
  const lastUpdated = project.progress.reduce((m, r) => (r.updatedAt && (!m || new Date(r.updatedAt) > new Date(m)) ? r.updatedAt : m), null)

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-background p-4">
        <div className="relative flex size-16 items-center justify-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-muted" />
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${((overall ?? 0) / 100) * 97.4} 97.4`} />
          </svg>
          <span className="text-sm font-semibold tabular-nums">{overall == null ? "—" : `${overall}%`}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Development progress</p>
          <p className="text-sm text-muted-foreground">{lastUpdated ? `Last updated ${timeAgo(lastUpdated)}` : "Not tracked yet"}</p>
        </div>
        {canEdit && (
          <Button leftIcon="pulse-line" onClick={() => setEditing(true)}>
            Update progress
          </Button>
        )}
      </div>
      {scopes.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {scopes.map((s) => (
            <section key={s.id ?? "all"} className="rounded-xl border bg-background p-4">
              <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
                {s.name}
                <span className="text-xs font-normal text-muted-foreground">{average(s.rows)}% average</span>
              </h3>
              <ul className="space-y-3">
                {s.rows.map((r) => (
                  <li key={r.work}>
                    <p className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Icon name={works.map[r.work]?.icon ?? "tools-line"} className="text-muted-foreground" />
                        {works.label(r.work)}
                      </span>
                      <span className="font-medium tabular-nums">{r.percent}%</span>
                    </p>
                    <Bar percent={r.percent} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
          No progress recorded yet.{canEdit ? " Update progress to track roads, electricity, sewerage and more." : ""}
        </p>
      )}
      {editing && <ProgressDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  )
}

// ---------- updates ----------

function UpdateDialog({ project, update, onClose }) {
  const types = useList("update-type")
  const { run, pending, error, errors } = useSave()
  const [form, setForm] = useState(() => ({
    type: update?.type ?? types.defaultValue ?? types.options[0]?.value ?? "",
    title: update?.title ?? "",
    body: update?.body ?? "",
    phaseId: update?.phaseId ? String(update.phaseId) : "",
    postedAt: toPktDate(update?.postedAt ?? new Date()),
  }))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-2xl"
      title={update ? "Edit update" : "Post an update"}
      description="Shows on the project's timeline for your team."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="send-plane-line" loading={pending} onClick={() => run(() => saveUpdate(project.code, form, update?.code), onClose)}>
            {update ? "Save" : "Post update"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-3">
        <LookupSelect list="update-type" label="Type" value={form.type} onChange={set("type")} error={errors.type} />
        <Select label="Phase" value={form.phaseId} onChange={set("phaseId")} options={[{ value: "", label: "Whole project" }, ...project.phases.map((p) => ({ value: String(p.id), label: p.name }))]} />
        <DatePicker label="Date" value={form.postedAt} onChange={(v) => set("postedAt")(v || toPktDate(new Date()))} clearable={false} />
      </div>
      <Input label="Title" required autoFocus value={form.title} onChange={(e) => set("title")(e.target.value)} error={errors.title} placeholder="e.g. Carpeting of Block A roads complete" />
      <Textarea label="Details" rows={5} value={form.body} onChange={(e) => set("body")(e.target.value)} error={errors.body} placeholder="What was done, what's next" />
      {!update && <p className="text-xs text-muted-foreground">Add photos to the update after posting it.</p>}
    </Dialog>
  )
}

// One update on the timeline
function UpdateItem({ u, project, canEdit, pending, onEdit, onPhotos, onDelete }) {
  const [viewing, setViewing] = useState(null) // photo index in the lightbox
  const types = useList("update-type")
  const works = useList("development-work")
  const color = toHex(types.map[u.type]?.color) ?? "#64748b"
  const phaseName = project.phases.find((p) => p.id === u.phaseId)?.name
  return (
    <article className="rounded-xl border bg-background p-4 shadow-xs">
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={color}>{types.label(u.type)}</Badge>
            {phaseName && <span className="text-xs text-muted-foreground">{phaseName}</span>}
          </div>
          <h3 className="mt-1.5 font-semibold">{u.title}</h3>
          <p className="text-xs text-muted-foreground">
            {formatDate(u.postedAt)}
            {u.author ? ` · ${u.author}` : ""}
          </p>
        </div>
        {canEdit && (
          <DropdownMenu
            align="end"
            items={[
              { label: "Add photos", icon: "image-add-line", onClick: onPhotos },
              { label: "Edit", icon: "edit-line", onClick: onEdit },
              { type: "separator" },
              { label: "Delete", icon: "delete-bin-6-line", variant: "destructive", onClick: onDelete },
            ]}
            trigger={<Button variant="ghost" size="smicon" leftIcon="more-2-line" aria-label={`${u.title} actions`} disabled={pending} />}
          />
        )}
      </header>
      {u.body && <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{u.body}</p>}
      {u.changes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {u.changes.map((c) => (
            <span key={c.work} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              <Icon name={works.map[c.work]?.icon ?? "tools-line"} className="text-muted-foreground" />
              {works.label(c.work)} {c.from == null ? "" : `${c.from}% → `}
              <span className="font-semibold">{c.to == null ? "not tracked" : `${c.to}%`}</span>
            </span>
          ))}
        </div>
      )}
      {u.photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {u.photos.map((ph, i) => (
            <button
              key={ph.code}
              type="button"
              onClick={() => setViewing(i)}
              aria-label={`View ${ph.title}`}
              className="cursor-zoom-in overflow-hidden rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
              <img src={ph.url} alt={ph.title} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {viewing != null && <Lightbox images={u.photos} index={viewing} onClose={() => setViewing(null)} />}
    </article>
  )
}

// ---------- events ----------

const EVENT_STATUS = { scheduled: { label: "Scheduled", color: "blue" }, held: { label: "Held", color: "green" }, cancelled: { label: "Canceled", color: "gray" } }

function EventDialog({ project, event, onClose }) {
  const types = useList("event-type")
  const { run, pending, error, errors } = useSave()
  const [form, setForm] = useState(() => ({
    type: event?.type ?? types.defaultValue ?? types.options[0]?.value ?? "",
    title: event?.title ?? "",
    startsAt: event ? toPktDateTime(event.startsAt) : "",
    endsAt: event?.endsAt ? toPktDateTime(event.endsAt) : "",
    venue: event?.venue ?? "",
    description: event?.description ?? "",
    status: event?.status ?? "scheduled",
  }))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-2xl"
      title={event ? "Edit event" : "Add event"}
      description="Launches, balloting draws, possession ceremonies, expos and site visits."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="save-3-line" loading={pending} onClick={() => run(() => saveEvent(project.code, form, event?.code), onClose)}>
            {event ? "Save" : "Add event"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <LookupSelect list="event-type" label="Type" value={form.type} onChange={set("type")} error={errors.type} />
        <Select label="Status" value={form.status} onChange={set("status")} options={Object.entries(EVENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Input label="Title" required autoFocus value={form.title} onChange={(e) => set("title")(e.target.value)} error={errors.title} placeholder="e.g. Phase 2 balloting ceremony" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimePicker label="Starts" required value={form.startsAt} onChange={(v) => set("startsAt")(v ?? "")} error={errors.startsAt} />
        <DateTimePicker label="Ends" value={form.endsAt} onChange={(v) => set("endsAt")(v ?? "")} error={errors.endsAt} />
      </div>
      <Input label="Venue" value={form.venue} onChange={(e) => set("venue")(e.target.value)} placeholder="Site office, Expo Center Lahore…" />
      <Textarea label="Details" rows={3} value={form.description} onChange={(e) => set("description")(e.target.value)} />
    </Dialog>
  )
}

function EventCard({ event, canEdit, onEdit, onDelete, pending }) {
  const types = useList("event-type")
  const status = EVENT_STATUS[event.status] ?? EVENT_STATUS.scheduled
  const p = pktParts(event.startsAt)
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", month: "short" }).format(new Date(event.startsAt))
  return (
    <li className={cn("flex items-start gap-4 rounded-xl border bg-background p-4", event.status === "cancelled" && "opacity-60")}>
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border bg-muted/40 py-1.5">
        <span className="text-[11px] font-semibold text-primary uppercase">{month}</span>
        <span className="text-xl leading-none font-semibold tabular-nums">{Number(p.day)}</span>
        <span className="text-[11px] text-muted-foreground">{p.year}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name={types.map[event.type]?.icon ?? "calendar-event-line"} /> {types.label(event.type)}
          </span>
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <h3 className="mt-1 font-semibold">{event.title}</h3>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(event.startsAt)}
          {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
          {event.venue ? ` · ${event.venue}` : ""}
        </p>
        {event.description && <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{event.description}</p>}
      </div>
      {canEdit && (
        <DropdownMenu
          align="end"
          items={[{ label: "Edit", icon: "edit-line", onClick: onEdit }, { type: "separator" }, { label: "Delete", icon: "delete-bin-6-line", variant: "destructive", onClick: onDelete }]}
          trigger={<Button variant="ghost" size="smicon" leftIcon="more-2-line" aria-label={`${event.title} actions`} disabled={pending} />}
        />
      )}
    </li>
  )
}

// Updates & events in one place: upcoming events pinned on top, then one timeline of updates and
// past events, newest first
export function ProjectTimeline({ project, canEdit }) {
  const router = useRouter()
  const types = useList("update-type")
  const eventTypes = useList("event-type")
  const { run, pending, error } = useSave()
  const [editingUpdate, setEditingUpdate] = useState(null) // update | "new"
  const [editingEvent, setEditingEvent] = useState(null) // event | "new"
  const [photosFor, setPhotosFor] = useState(null)
  const [now] = useState(() => Date.now())

  const upcoming = project.events.filter((e) => e.status === "scheduled" && new Date(e.endsAt ?? e.startsAt).getTime() >= now)
  const timeline = [
    ...project.updates.map((u) => ({ kind: "update", at: new Date(u.postedAt).getTime(), item: u })),
    ...project.events.filter((e) => !upcoming.includes(e)).map((e) => ({ kind: "event", at: new Date(e.startsAt).getTime(), item: e })),
  ].sort((a, b) => b.at - a.at)

  const eventCard = (e) => (
    <EventCard
      key={e.code}
      event={e}
      canEdit={canEdit}
      pending={pending}
      onEdit={() => setEditingEvent(e)}
      onDelete={async () =>
        (await confirm({ title: `Delete the event “${e.title}”?`, description: "It's removed from the project's calendar and timeline. This can't be undone.", confirmLabel: "Delete event", destructive: true })) &&
        run(() => deleteEvent(e.code))
      }
    />
  )

  return (
    <div className="space-y-5 pt-2">
      {error && <Notice tone="error">{error}</Notice>}
      {canEdit && (
        <div className="flex justify-end">
          <DropdownMenu
            align="end"
            items={[
              { label: "Post an update", icon: "newspaper-line", onClick: () => setEditingUpdate("new") },
              { label: "Add an event", icon: "calendar-event-line", onClick: () => setEditingEvent("new") },
            ]}
            trigger={<Button leftIcon="add-line">Add</Button>}
          />
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Icon name="calendar-event-line" /> Upcoming events
          </h3>
          <ul className="space-y-3">{upcoming.map(eventCard)}</ul>
        </section>
      )}

      {timeline.length > 0 ? (
        <section className="space-y-2">
          {upcoming.length > 0 && <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Timeline</h3>}
          <ol className="relative space-y-5 border-l pl-6">
            {timeline.map(({ kind, item }) => {
              const dot = kind === "update" ? (toHex(types.map[item.type]?.color) ?? "#64748b") : null
              return (
                <li key={`${kind}-${item.code}`} className="relative">
                  {kind === "update" ? (
                    <span className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full ring-4 ring-background" style={{ backgroundColor: dot }} />
                  ) : (
                    <span className="absolute top-1 -left-[2.2rem] flex size-5 items-center justify-center rounded-full bg-background text-xs text-primary ring-1 ring-border">
                      <Icon name={eventTypes.map[item.type]?.icon ?? "calendar-event-line"} />
                    </span>
                  )}
                  {kind === "update" ? (
                    <UpdateItem
                      u={item}
                      project={project}
                      canEdit={canEdit}
                      pending={pending}
                      onEdit={() => setEditingUpdate(item)}
                      onPhotos={() => setPhotosFor(item)}
                      onDelete={async () =>
                        (await confirm({
                          title: `Delete the update “${item.title}”?`,
                          description: "It's removed from the project's timeline, with its photos. This can't be undone.",
                          confirmLabel: "Delete update",
                          destructive: true,
                        })) && run(() => deleteUpdate(item.code))
                      }
                    />
                  ) : (
                    <ul>{eventCard(item)}</ul>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ) : (
        !upcoming.length && (
          <p className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
            Nothing here yet.{canEdit ? " Post construction progress, approvals and announcements, and add launches, balloting draws and possession ceremonies." : ""}
          </p>
        )
      )}

      {editingUpdate && <UpdateDialog project={project} update={editingUpdate === "new" ? null : editingUpdate} onClose={() => setEditingUpdate(null)} />}
      {editingEvent && <EventDialog project={project} event={editingEvent === "new" ? null : editingEvent} onClose={() => setEditingEvent(null)} />}
      {photosFor && (
        <AssetManager
          title={`Photos for “${photosFor.title}”`}
          collection="images"
          accept="image/jpeg,image/png,image/webp"
          uploadHint="JPG, PNG or WebP, up to 10 MB each."
          scopes={[
            { value: "here", label: "This project", ownerType: "project", ownerCode: project.code },
            { value: "all", label: "All workspace files" },
          ]}
          upload={(data) => uploadUpdatePhoto(photosFor.code, data)}
          attach={(codes) => attachUpdatePhotos(photosFor.code, codes)}
          onClose={() => setPhotosFor(null)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  )
}
