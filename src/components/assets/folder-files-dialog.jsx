"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatSize, timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tooltip } from "@/components/ui/tooltip"
import { FileIcon, FilePreviewDialog } from "./file-preview-dialog"

// File manager for one record's folder: search, Upload, tick files, Apply.
//   folder        { name, label }: the row at the top, e.g. { name: "BK-2026-000003", label: "Booking folder" }
//   files         [{ code, url, name, mime, size, at, hint }] in the folder
//   initial       codes ticked when it opens
//   upload(form)  FormData with "files" → { ok, codes } | { error }; uploaded files come back ticked
//   apply(codes)  → { ok } | { error } (or nothing); closes when it works
//   max           most files that can be ticked (1: a single pick, which replaces the last)
export function FolderFilesDialog({ title, description, folder, files, initial = [], accept = "image/jpeg,image/png,image/webp,application/pdf", upload, apply, applyLabel = "Apply", max, onClose }) {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState(() => new Set(initial))
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null) // index into files
  const picker = useRef(null)
  const [pending, startTransition] = useTransition()
  const term = q.trim().toLowerCase()
  const shown = files.filter((f) => !term || [f.name, f.hint].some((t) => t?.toLowerCase().includes(term)))
  // max 1: picking one replaces the choice (image fields)
  const single = max === 1
  const full = !single && max != null && selected.size >= max

  const toggle = (code, on) =>
    setSelected((prev) => {
      const next = new Set(single && on ? [] : prev)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  const send = (list) => {
    const chosen = Array.from(list ?? [])
    if (!chosen.length) return
    setUploading(true)
    startTransition(async () => {
      const form = new FormData()
      for (const f of chosen) form.append("files", f)
      const r = await upload(form)
      setUploading(false)
      if (r?.error) return toast.error(r.error)
      toast.success(chosen.length > 1 ? `${chosen.length} files uploaded.` : "Uploaded.")
      setSelected((prev) => (single ? new Set((r?.codes ?? []).slice(-1).length ? (r?.codes ?? []).slice(-1) : prev) : new Set([...prev, ...(r?.codes ?? [])])))
    })
  }
  const done = () =>
    startTransition(async () => {
      const r = await apply([...selected])
      if (r?.error) return toast.error(r.error)
      onClose()
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(48rem,calc(100%-4rem))]"
      title={title}
      description={description}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted-foreground">{selected.size ? (single ? "1 chosen" : `${selected.size} selected${max != null ? ` of up to ${max}` : ""}`) : "Nothing selected"}</span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending && !uploading} disabled={uploading} onClick={done}>
            {applyLabel}
          </Button>
        </>
      }
    >
      <div className="flex h-[min(28rem,60svh)] flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-40 flex-1">
            <Input type="search" placeholder="Search by name…" aria-label="Search files" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
          <Button variant="outline" leftIcon="upload-cloud-2-line" loading={uploading} onClick={() => picker.current?.click()}>
            Upload
          </Button>
          <input
            ref={picker}
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              send(e.target.files)
              e.target.value = ""
            }}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
            <Icon name="folder-3-fill" className="text-base text-primary" />
            <span className="font-medium tabular-nums">{folder.name}</span>
            <span className="text-muted-foreground">{folder.label}</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
          </div>
          <ScrollView variant="subtle" className="min-h-0 flex-1" viewportClassName="p-2">
            {shown.length ? (
              <ul className="divide-y">
                {shown.map((f) => {
                  const on = selected.has(f.code)
                  const blocked = !on && full
                  return (
                    <li key={f.code} className="py-0.5">
                      <div
                        role="checkbox"
                        aria-checked={on}
                        aria-disabled={blocked}
                        tabIndex={0}
                        onClick={() => !blocked && toggle(f.code, !on)}
                        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), !blocked && toggle(f.code, !on))}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                          on && "bg-primary/5",
                          blocked && "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-input text-transparent")}>
                          <Icon name="check-line" />
                        </span>
                        {f.mime?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private workspace file, served by our own route
                          <img src={f.url} alt="" loading="lazy" className="size-9 shrink-0 rounded-md border bg-muted object-cover" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                            <FileIcon mime={f.mime} className="text-lg" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[f.hint, f.size && formatSize(f.size), f.at && timeAgo(f.at)].filter(Boolean).join(" · ")}</span>
                        </span>
                        <Tooltip content="Preview">
                          <button
                            type="button"
                            aria-label={`Preview ${f.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreview(files.indexOf(f))
                            }}
                            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Icon name="eye-line" />
                          </button>
                        </Tooltip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <Icon name="folder-open-line" className="text-3xl" />
                <p className="mt-2">{q ? `Nothing matches “${q}”.` : "No folders or files here yet."}</p>
              </div>
            )}
          </ScrollView>
        </div>
      </div>
      {preview != null && <FilePreviewDialog files={files} index={preview} onClose={() => setPreview(null)} />}
    </Dialog>
  )
}
