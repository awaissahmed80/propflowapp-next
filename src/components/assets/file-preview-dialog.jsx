"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { formatSize } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { PdfViewer } from "./pdf-viewer"

// Workspace files: an icon by kind, a thumbnail strip, and a lightbox to view one, step through
// the rest, download it (in its own format: PDF, image, spreadsheet…) or print it.
//   file: { url, name, mime, size }

const kindOf = (mime = "") =>
  mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : mime.startsWith("audio/") ? "audio" : /sheet|excel|csv/.test(mime) ? "sheet" : /word|document/.test(mime) ? "doc" : "file"
const ICONS = {
  image: ["image-line", "text-sky-600 dark:text-sky-400"],
  pdf: ["file-pdf-2-line", "text-red-600 dark:text-red-400"],
  audio: ["mic-line", "text-violet-600 dark:text-violet-400"],
  sheet: ["file-excel-2-line", "text-emerald-600 dark:text-emerald-400"],
  doc: ["file-word-2-line", "text-blue-600 dark:text-blue-400"],
  file: ["file-line", "text-muted-foreground"],
}
const DOWNLOAD = { image: "Download image", pdf: "Download PDF", sheet: "Download Excel", doc: "Download document", audio: "Download audio", file: "Download" }

export function FileIcon({ mime, className }) {
  const [icon, tone] = ICONS[kindOf(mime)]
  return <Icon name={icon} className={cn("shrink-0", tone, className)} />
}

const withParam = (url, p) => `${url}${url.includes("?") ? "&" : "?"}${p}`

// Print a file without leaving the page: images in a tiny page of their own, PDFs in the
// browser's PDF viewer (same origin, so the frame can be told to print)
function printFile(file) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(frame)
  const cleanup = () => setTimeout(() => frame.remove(), 60_000)
  if (kindOf(file.mime) === "image") {
    const doc = frame.contentDocument
    doc.open()
    doc.write(
      `<!doctype html><title>${file.name.replace(/</g, "")}</title><style>@page{margin:12mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%}</style><img src="${file.url}">`,
    )
    doc.close()
    frame.contentWindow.document.querySelector("img").onload = () => {
      frame.contentWindow.focus()
      frame.contentWindow.print()
      cleanup()
    }
  } else {
    frame.onload = () => {
      try {
        frame.contentWindow.focus()
        frame.contentWindow.print()
      } catch {
        window.open(file.url, "_blank", "noopener")
      }
      cleanup()
    }
    frame.src = file.url
  }
}

export function FilePreviewDialog({ files, index = 0, onClose }) {
  const [at, setAt] = useState(index)
  const file = files[at]
  const kind = kindOf(file?.mime)
  const many = files.length > 1
  const go = (d) => setAt((i) => (i + d + files.length) % files.length)
  const count = files.length

  useEffect(() => {
    if (count < 2) return
    const onKey = (e) => {
      if (e.key === "ArrowRight") setAt((i) => (i + 1) % count)
      if (e.key === "ArrowLeft") setAt((i) => (i - 1 + count) % count)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [count])

  if (!file) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="gap-3 sm:max-w-5xl"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <FileIcon mime={file.mime} />
          <span className="truncate">{file.name}</span>
        </span>
      }
      description={[file.size ? formatSize(file.size) : null, many ? `${at + 1} of ${files.length}` : null].filter(Boolean).join(" · ") || undefined}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Tooltip content="Open in a new tab">
            <a href={file.url} target="_blank" rel="noreferrer" className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent">
              <Icon name="external-link-line" /> Open
            </a>
          </Tooltip>
          {["image", "pdf"].includes(kind) && (
            <Button variant="outline" leftIcon="printer-line" onClick={() => printFile(file)}>
              Print
            </Button>
          )}
          <a
            href={withParam(file.url, "download=1")}
            download={file.name}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
          >
            <Icon name="download-2-line" /> {DOWNLOAD[kind]}
          </a>
        </div>
      }
    >
      <div className="relative -mx-4 flex h-[min(70svh,44rem)] items-center justify-center overflow-hidden border-y bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- private workspace file, served by our own route
          <img key={file.url} src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" />
        )}
        {kind === "pdf" && <PdfViewer key={file.url} url={file.url} />}
        {kind === "audio" && <audio key={file.url} src={file.url} controls className="w-full max-w-md" />}
        {!["image", "pdf", "audio"].includes(kind) && (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-background px-10 py-8 text-center shadow-xs">
            <FileIcon mime={file.mime} className="text-5xl" />
            <p className="text-sm text-muted-foreground">There&apos;s no preview for this file. Download it to open it.</p>
          </div>
        )}
        {many && (
          <>
            <button
              type="button"
              aria-label="Previous file"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-background/90 text-lg shadow-sm hover:bg-background"
            >
              <Icon name="arrow-left-s-line" />
            </button>
            <button
              type="button"
              aria-label="Next file"
              onClick={() => go(1)}
              className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border bg-background/90 text-lg shadow-sm hover:bg-background"
            >
              <Icon name="arrow-right-s-line" />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {files.map((f, i) => (
            <button
              key={f.url}
              type="button"
              onClick={() => setAt(i)}
              aria-label={f.name}
              className={cn(
                "flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 bg-muted/40",
                i === at ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              {kindOf(f.mime) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- private workspace file
                <img src={f.url} alt="" className="size-full object-cover" />
              ) : (
                <FileIcon mime={f.mime} className="text-2xl" />
              )}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  )
}

// Thumbnails for a list of files; clicking one opens the lightbox at it
export function FileThumbs({ files, size = "size-16", className }) {
  const [open, setOpen] = useState(null)
  if (!files?.length) return null
  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {files.map((f, i) =>
          kindOf(f.mime) === "image" ? (
            <button key={f.url} type="button" onClick={() => setOpen(i)} title={f.name} className="block cursor-zoom-in overflow-hidden rounded-md border transition hover:opacity-90">
              {/* eslint-disable-next-line @next/next/no-img-element -- workspace file, served by our own route */}
              <img src={f.url} alt={f.name} className={cn(size, "object-cover")} />
            </button>
          ) : (
            <button
              key={f.url}
              type="button"
              onClick={() => setOpen(i)}
              title={f.name}
              className={cn(size, "flex cursor-zoom-in flex-col items-center justify-center gap-1 overflow-hidden rounded-md border bg-muted/40 px-1 transition-colors hover:bg-muted")}
            >
              <FileIcon mime={f.mime} className="text-xl" />
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">{f.name}</span>
            </button>
          ),
        )}
      </div>
      {open != null && <FilePreviewDialog files={files} index={open} onClose={() => setOpen(null)} />}
    </>
  )
}
