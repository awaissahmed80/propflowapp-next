"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatSize } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { CopyField } from "@/components/copy-field"
import { FilePreviewDialog } from "@/components/assets/file-preview-dialog"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createShareLink, deleteDocument, updateDocument } from "../server/actions"
import { DocIcon, download, downloadName } from "./doc-parts"

// Upload, edit, new version, share and delete for company documents, used by the list, the
// Expiring page and a document's own page. useDocumentActions() gives a document's menu items
// and the dialogs to render.
//   can: { create, edit, delete, expiry, share } · projects: [{ code, name }]

export const MAX_MB = 20
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp"
const OK_EXT = /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i
const check = (file) => (!OK_EXT.test(file.name) ? `${file.name} isn't a PDF, photo, Word or Excel file.` : file.size > MAX_MB * 1024 * 1024 ? `${file.name} is over ${MAX_MB} MB.` : null)

// Upload through the route (files up to 20 MB) → the action's result
async function send(form) {
  try {
    const res = await fetch("/api/documents/upload", { method: "POST", body: form })
    return await res.json()
  } catch {
    return { error: "The upload didn't go through. Check your connection and try again." }
  }
}

const projectOptions = (projects) => [{ value: "", label: "Not project-specific" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]

function DropZone({ multiple = true, onFiles, children, className }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onFiles([...e.dataTransfer.files])
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          over ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-muted/40",
          className,
        )}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          onFiles([...e.target.files])
          e.target.value = ""
        }}
      />
    </>
  )
}

// New documents: drop several files, one type, project, expiry and note for all of them
export function UploadDialog({ type, projects, can, onClose, onDone }) {
  const types = useList("document-type")
  const [files, setFiles] = useState([]) // [{ file, error?, done? }]
  const [f, setF] = useState({ title: "", type: type ?? types.options[0]?.value ?? "", project: "", expiresOn: "", note: "" })
  const [progress, setProgress] = useState(null)
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const busy = progress != null
  useUnsavedGuard(files.length > 0 && !busy)

  const add = (list) => {
    const bad = list.map(check).filter(Boolean)
    if (bad.length) toast.error(bad.join(" "))
    setFiles((cur) => [...cur.filter((x) => !x.done), ...list.filter((x) => !check(x)).map((file) => ({ file }))].slice(0, 20))
  }
  const upload = async () => {
    const queue = files.filter((x) => !x.done)
    let ok = 0
    const next = [...files]
    for (const [i, item] of queue.entries()) {
      setProgress({ at: i + 1, of: queue.length })
      const form = new FormData()
      form.append("files", item.file)
      for (const [k, v] of Object.entries({ type: f.type, project: f.project, expiresOn: f.expiresOn, note: f.note, title: queue.length === 1 ? f.title : "" })) form.set(k, v)
      const r = await send(form)
      const at = next.indexOf(item)
      if (r?.ok) {
        ok++
        next[at] = { ...item, done: true }
      } else next[at] = { ...item, error: r?.error ?? Object.values(r?.fieldErrors ?? {})[0] ?? "That didn't work." }
      setFiles([...next])
    }
    setProgress(null)
    if (ok) toast.success(ok === 1 ? "Document uploaded." : `${ok} documents uploaded.`)
    if (ok === queue.length) onDone()
  }
  const pending = files.filter((x) => !x.done)

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      scrollable
      className="sm:max-w-lg"
      title="Upload documents"
      description={`PDFs, photos and scans, Word or Excel files, up to ${MAX_MB} MB each.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button leftIcon="upload-2-line" loading={busy} disabled={!pending.length || !f.type} onClick={upload}>
            {busy ? `Uploading ${progress.at} of ${progress.of}…` : pending.length > 1 ? `Upload ${pending.length} files` : "Upload"}
          </Button>
        </>
      }
    >
      <DropZone onFiles={add}>
        <Icon name="upload-cloud-2-line" className="text-2xl text-primary" />
        <span className="font-medium">Drop files here or click to choose</span>
        <span className="text-xs text-muted-foreground">Several at once are filed the same way</span>
      </DropZone>
      {files.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {files.map((x, i) => (
            <li key={`${x.file.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
              <DocIcon mime={x.file.type} className="size-7 text-base" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{x.file.name}</span>
                <span className={cn("block truncate text-xs", x.error ? "text-destructive" : "text-muted-foreground")}>{x.error ?? (x.done ? "Uploaded" : formatSize(x.file.size))}</span>
              </span>
              {x.done ? (
                <Icon name="checkbox-circle-fill" className="text-lg text-emerald-600" />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${x.file.name}`}
                  onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Icon name="close-line" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.length === 1 && <Input label="Name" placeholder={pending[0].file.name.replace(/\.[^.]+$/, "")} value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={150} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" required value={f.type} onChange={(v) => set({ type: v })} options={types.options} />
        <Select label="Project" value={f.project} onChange={(v) => set({ project: v ?? "" })} options={projectOptions(projects)} />
      </div>
      {can.expiry && <DatePicker label="Expires on (optional)" value={f.expiresOn} onChange={(v) => set({ expiresOn: v || "" })} />}
      <Textarea label="Note" rows={2} maxLength={500} placeholder="Reference no., who signed it, where the original is kept" value={f.note} onChange={(e) => set({ note: e.target.value })} />
    </Dialog>
  )
}

// Rename, move to another type or project, expiry and note
export function EditDialog({ doc, projects, can, onClose, onDone }) {
  const types = useList("document-type")
  const initial = { title: doc.title, type: doc.type, project: doc.project?.code ?? "", expiresOn: doc.expiresOn ?? "", note: doc.note ?? "" }
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => updateDocument(doc.code, f), { loading: "Saving…", success: "Saved." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onDone()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-lg"
      title="Edit document"
      description="Name, type and project apply to every version."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} disabled={!dirty || !f.title.trim()} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" required value={f.title} maxLength={150} error={errors.title} onChange={(e) => set({ title: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Type" required value={f.type} error={errors.type} onChange={(v) => set({ type: v })} options={types.options} />
          <Select label="Project" value={f.project} error={errors.project} onChange={(v) => set({ project: v ?? "" })} options={projectOptions(projects)} />
        </div>
        {can.expiry && <DatePicker label="Expires on (optional)" value={f.expiresOn} error={errors.expiresOn} onChange={(v) => set({ expiresOn: v || "" })} />}
        <Textarea label="Note" rows={2} maxLength={500} value={f.note} error={errors.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
    </Dialog>
  )
}

// A newer file for the document (a renewed NOC, a signed copy): earlier versions are kept
export function NewVersionDialog({ doc, can, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [expiresOn, setExpiresOn] = useState(doc.expiresOn ?? "")
  const [busy, setBusy] = useState(false)
  useUnsavedGuard(Boolean(file) && !busy)
  const choose = ([f]) => {
    if (!f) return
    const bad = check(f)
    if (bad) return toast.error(bad)
    setFile(f)
  }
  const upload = async () => {
    setBusy(true)
    const form = new FormData()
    form.set("replaces", doc.code)
    form.append("files", file)
    if (can.expiry) form.set("expiresOn", expiresOn)
    const id = toast.loading("Uploading…")
    const r = await send(form)
    setBusy(false)
    if (r?.ok) {
      toast.success(`Version ${doc.version + 1} uploaded.`, { id })
      onDone(r.code)
    } else toast.error(r?.error ?? "That didn't work. Try again.", { id })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      className="sm:max-w-lg"
      title={`New version of ${doc.title}`}
      description={`It becomes version ${doc.version + 1}. Version ${doc.version} and earlier stay in its history, and share links open the new one.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button leftIcon="upload-2-line" loading={busy} disabled={!file} onClick={upload}>
            Upload version {doc.version + 1}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <DropZone multiple={false} onFiles={choose}>
          <Icon name={file ? "file-check-line" : "upload-cloud-2-line"} className="text-2xl text-primary" />
          {file ? (
            <span>
              <span className="font-medium">{file.name}</span> · {formatSize(file.size)}
            </span>
          ) : (
            <>
              <span className="font-medium">Drop the new file here or click to choose</span>
              <span className="text-xs text-muted-foreground">PDF, photo, Word or Excel, up to {MAX_MB} MB</span>
            </>
          )}
        </DropZone>
        {can.expiry && <DatePicker label="Expires on" value={expiresOn} onChange={(v) => setExpiresOn(v || "")} />}
      </div>
    </Dialog>
  )
}

const DAYS = [1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }))

// A link that opens the document without signing in, until it expires
export function ShareDialog({ doc, onClose, onDone }) {
  const [days, setDays] = useState("7")
  const [note, setNote] = useState("")
  const [made, setMade] = useState(null) // { url, expiresAt }
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const create = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => createShareLink(doc.code, { days: Number(days), note }), { loading: "Making the link…", success: "Link ready. Copy it and send it." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) {
        setMade(r)
        onDone?.()
      }
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-lg"
      title={`Share ${doc.title}`}
      description="Anyone with the link can view and download this document, without signing in, until it expires. Every open is logged."
      footer={
        made ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button leftIcon="link" loading={pending} onClick={create}>
              Create link
            </Button>
          </>
        )
      }
    >
      {made ? (
        <div className="space-y-2">
          <CopyField label="Share link" value={made.url} />
          <p className="text-xs text-muted-foreground">Expires {formatDate(made.expiresAt)}. You can revoke it any time from the document or Shared links.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Select label="Link works for" value={days} error={errors.days} onChange={setDays} options={DAYS} />
          <Input label="Who it's for (optional)" placeholder="e.g. Meezan Bank, mortgage team" maxLength={200} value={note} error={errors.note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </Dialog>
  )
}

// A document's menu items and dialogs, wherever documents are listed
//   onChanged(): refresh after a change · onDeleted(): after deleting (default: refresh)
export function useDocumentActions({ can, projects, onDeleted }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // { kind, doc }
  const close = () => setDialog(null)
  const done = () => {
    setDialog(null)
    router.refresh()
  }
  const remove = async (doc) => {
    const ok = await confirm({
      title: `Delete ${doc.title}?`,
      description: doc.version > 1 ? `All ${doc.version} versions are removed for everyone, and its share links stop working.` : "It's removed for everyone in the workspace, and its share links stop working.",
      confirmLabel: "Delete",
      destructive: true,
      icon: "delete-bin-6-line",
    })
    if (!ok) return
    const r = await toastAction(() => deleteDocument(doc.code), { loading: "Deleting…", success: `${doc.title} deleted.` })
    if (r?.ok) (onDeleted ?? (() => router.refresh()))(doc)
  }
  const menu = (doc, { open = true } = {}) => [
    ...(open ? [{ label: "Open", icon: "eye-line", onClick: () => setDialog({ kind: "preview", doc }) }] : []),
    { label: "Download", icon: "download-2-line", onClick: () => download(doc) },
    ...(can.edit
      ? [
          { label: "Edit or move", icon: "edit-line", onClick: () => setDialog({ kind: "edit", doc }) },
          { label: "New version", icon: "upload-2-line", onClick: () => setDialog({ kind: "version", doc }) },
        ]
      : []),
    ...(can.share && doc.canShare ? [{ label: "Share link", icon: "share-forward-line", onClick: () => setDialog({ kind: "share", doc }) }] : []),
    ...(can.delete ? [{ type: "separator" }, { label: "Delete", icon: "delete-bin-6-line", variant: "destructive", onClick: () => remove(doc) }] : []),
  ]
  const dialogs = (
    <>
      {dialog?.kind === "preview" && <FilePreviewDialog files={[{ url: dialog.doc.url, name: downloadName(dialog.doc), mime: dialog.doc.mime, size: dialog.doc.size }]} onClose={close} />}
      {dialog?.kind === "edit" && <EditDialog doc={dialog.doc} projects={projects} can={can} onClose={close} onDone={done} />}
      {dialog?.kind === "version" && <NewVersionDialog doc={dialog.doc} can={can} onClose={close} onDone={done} />}
      {dialog?.kind === "share" && <ShareDialog doc={dialog.doc} onClose={done} />}
    </>
  )
  return { menu, dialogs, open: (kind, doc) => setDialog({ kind, doc }) }
}
