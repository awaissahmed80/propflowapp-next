"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { formatDateTime, timeAgo } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tooltip } from "@/components/ui/tooltip"
import { VoicePlayer } from "@/components/voice-player"
import { VoiceRecorder } from "@/modules/crm/components/voice-recorder"
import { FileIcon, FileThumbs } from "@/components/assets/file-preview-dialog"
import { FolderFilesDialog } from "@/components/assets/folder-files-dialog"
import { addBookingActivity, uploadBookingFiles } from "../server/bookings"

// A booking's timeline, like a lead's history: what Sales did (system events, small and muted)
// and what people logged (notes, calls, WhatsApp, meetings…) with their files. Oldest at the
// top, newest at the bottom; the composer is pinned underneath.

const EVENT_ICONS = {
  created: "hand-coin-line",
  plan: "calendar-todo-line",
  kyc: "id-card-line",
  receipt: "money-dollar-circle-line",
  "payment-request": "file-text-line",
  cleared: "checkbox-circle-line",
  bounced: "close-circle-line",
  allotted: "file-paper-2-line",
  handover: "key-2-line",
  completed: "home-smile-line",
  hold: "pause-circle-line",
  cancelled: "close-circle-line",
  document: "file-upload-line",
  assigned: "user-shared-line",
  approval: "shield-check-line",
}
const EVENT_TONE = { bounced: "text-red-600 dark:text-red-400", cancelled: "text-red-600 dark:text-red-400", cleared: "text-emerald-600 dark:text-emerald-400", completed: "text-emerald-600 dark:text-emerald-400" }
const NOTE = { value: "note", label: "Note", icon: "sticky-note-line", color: "#64748b" }
const MAX_FILES = 5

function Item({ a, types }) {
  if (a.type === "system") {
    return (
      <li className="flex items-start gap-2.5 py-1.5 text-[13px] text-muted-foreground">
        <span className={cn("mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-sm", EVENT_TONE[a.event])}>
          <Icon name={EVENT_ICONS[a.event] ?? "git-commit-line"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="whitespace-pre-line text-foreground/80">{a.notes}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs">
            {a.by && (
              <>
                <Avatar name={a.by.name} source={a.by.avatarUrl} size="xs" />
                <span className="font-medium text-foreground/70">{a.by.name}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <Tooltip content={formatDateTime(a.at)}>
              <span>{timeAgo(a.at)}</span>
            </Tooltip>
          </span>
        </span>
      </li>
    )
  }
  const t = a.type === "note" ? NOTE : (types.map[a.type] ?? { label: a.type, icon: "chat-check-line" })
  const color = toHex(t.color) ?? "#64748b"
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <Avatar name={a.by?.name ?? "?"} source={a.by?.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
          <span className="font-semibold">{a.by?.name ?? "Someone"}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium" style={{ color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}>
            <Icon name={t.icon ?? "chat-check-line"} />
            {t.label}
          </span>
          <Tooltip content={formatDateTime(a.at)}>
            <span className="text-xs text-muted-foreground">{timeAgo(a.at)}</span>
          </Tooltip>
        </p>
        {a.voice && <VoicePlayer src={a.voice.url} className="mt-1.5 max-w-80" />}
        {a.notes && <p className="mt-1 text-sm whitespace-pre-line">{a.notes}</p>}
        <FileThumbs files={a.files} className="mt-2" />
      </div>
    </li>
  )
}

export function BookingActivity({ booking: b, canEdit }) {
  const router = useRouter()
  const types = useList("activity-type")
  const options = [NOTE, ...types.options.map((o) => ({ value: o.value, label: o.label, icon: types.map[o.value]?.icon, color: types.map[o.value]?.color }))]
  const [type, setType] = useState("note")
  const [notes, setNotes] = useState("")
  const [attached, setAttached] = useState([]) // codes of files picked from the booking's folder
  const [picking, setPicking] = useState(false)
  const [voice, setVoice] = useState(null) // { blob, url, seconds, type } once recorded
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const scroller = useRef(null)
  const current = options.find((o) => o.value === type) ?? NOTE
  const folder = b.documents.files
  const chosen = attached.map((c) => folder.find((f) => f.code === c)).filter(Boolean)

  // Newest at the bottom: keep it in view when the booking opens and when something is added
  const last = b.activity[b.activity.length - 1]?.id
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [last])

  const save = () =>
    startTransition(async () => {
      setError("")
      let form = null
      if (voice) {
        form = new FormData()
        if (voice) form.append("voice", new File([voice.blob], `voice-note.${voice.type.includes("mp4") ? "m4a" : voice.type.includes("ogg") ? "ogg" : "webm"}`, { type: voice.type }))
      }
      const r = await addBookingActivity(b.code, { type, notes, attachments: attached }, form)
      if (r?.fieldErrors) setError(Object.values(r.fieldErrors)[0])
      else if (r?.error) setError(r.error)
      else {
        toast.success(type === "note" ? "Note added." : `${current.label} logged.`)
        setNotes("")
        setAttached([])
        if (voice) URL.revokeObjectURL(voice.url)
        setVoice(null)
        setType("note")
        router.refresh()
      }
    })

  return (
    <section aria-label="Activity" className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Icon name="history-line" className="text-base text-muted-foreground" />
        <h2 className="text-sm font-semibold">Activity</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{b.activity.length}</span>
      </header>

      <ScrollView variant="subtle" className="min-h-0 flex-1" viewportRef={scroller} viewportClassName="px-4 py-3">
        <ol className="divide-y divide-border/60">
          {b.activity.map((a) => (
            <Item key={a.id} a={a} types={types} />
          ))}
        </ol>
      </ScrollView>

      {canEdit && (
        <div className="shrink-0 border-t bg-muted/40 p-3">
          <div className="rounded-xl border bg-background shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={type === "note" ? "Add a note for the team…" : `What happened on the ${current.label.toLowerCase()}?`}
              className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            {voice && (
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <VoicePlayer src={voice.url} seconds={voice.seconds} className="flex-1" />
                <button
                  type="button"
                  aria-label="Remove voice note"
                  onClick={() => {
                    URL.revokeObjectURL(voice.url)
                    setVoice(null)
                  }}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Icon name="delete-bin-line" />
                </button>
              </div>
            )}
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
                {chosen.map((f) => (
                  <span key={f.code} className="flex max-w-48 items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2 text-xs">
                    <FileIcon mime={f.mime} />
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setAttached(attached.filter((c) => c !== f.code))}
                      className="flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-muted"
                    >
                      <Icon name="close-line" className="text-[11px]" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 px-2 pb-2">
              <DropdownMenu
                align="start"
                side="top"
                items={options.map((o) => ({
                  key: o.value,
                  label: o.label,
                  icon: <Icon name={o.icon ?? "chat-check-line"} style={{ color: toHex(o.color) ?? undefined }} />,
                  selected: o.value === type,
                  onClick: () => setType(o.value),
                }))}
                trigger={
                  <button type="button" className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-muted">
                    <Icon name={current.icon ?? "chat-check-line"} style={{ color: toHex(current.color) ?? undefined }} />
                    {current.label}
                    <Icon name="arrow-down-s-line" className="text-xs text-muted-foreground" />
                  </button>
                }
              />
              <Tooltip content="Attach files from the booking folder">
                <button
                  type="button"
                  aria-label="Attach files"
                  onClick={() => setPicking(true)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md text-base text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Icon name="attachment-2" />
                </button>
              </Tooltip>
              <span className="flex-1" />
              {!voice && <VoiceRecorder className={recording ? "w-full" : undefined} onRecordingChange={setRecording} onDone={(v) => setVoice(v)} />}
              <Button size="sm" leftIcon="send-plane-line" loading={pending} disabled={recording || (!notes.trim() && !attached.length && !voice)} onClick={save}>
                Add
              </Button>
            </div>
          </div>
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </div>
      )}
      {picking && (
        <FolderFilesDialog
          title="Attach files"
          description="Pick files from the booking folder, or upload new ones into it."
          folder={{ name: b.code, label: "Booking folder" }}
          files={[...folder].reverse()}
          initial={attached}
          max={MAX_FILES}
          applyLabel="Attach"
          upload={async (form) => {
            const r = await uploadBookingFiles(b.code, form)
            if (!r?.error) router.refresh()
            return r
          }}
          apply={(codes) => {
            if (codes.length > MAX_FILES) return { error: `Up to ${MAX_FILES} files at a time.` }
            setAttached(codes)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  )
}
