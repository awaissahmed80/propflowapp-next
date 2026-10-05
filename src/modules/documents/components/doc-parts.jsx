"use client"

import { cn } from "@/lib/utils"
import { formatDate, formatSize } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"

// Small pieces shared by the Documents pages: a tinted file icon, the expiry badge, labels.

const KINDS = {
  pdf: { label: "PDF", icon: "file-pdf-2-line", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  image: { label: "Image", icon: "image-line", className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  word: { label: "Word", icon: "file-word-2-line", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  excel: { label: "Excel", icon: "file-excel-2-line", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  audio: { label: "Audio", icon: "mic-line", className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  file: { label: "File", icon: "file-line", className: "bg-muted text-muted-foreground" },
}

export const fileKind = (mime = "") =>
  mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : /sheet|excel/.test(mime) ? "excel" : /word/.test(mime) ? "word" : "file"
export const kindLabel = (mime) => KINDS[fileKind(mime)].label
export const previewable = (mime) => ["pdf", "image"].includes(fileKind(mime))

export function DocIcon({ mime, className }) {
  const k = KINDS[fileKind(mime)]
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-lg", k.className, className)}>
      <Icon name={k.icon} />
    </span>
  )
}

// Red once expired, amber within 30 days, plain text further off
export function ExpiryBadge({ doc, plain = false }) {
  const d = doc.daysLeft
  if (d == null) return plain ? <span className="text-muted-foreground">—</span> : null
  if (d < 0) return <Badge color="red">Expired {formatDate(doc.expiresOn)}</Badge>
  if (d === 0) return <Badge color="red">Expires today</Badge>
  if (d <= 30) return <Badge color="amber">Expires in {d === 1 ? "1 day" : `${d} days`}</Badge>
  return <span className="text-xs whitespace-nowrap text-muted-foreground">Valid till {formatDate(doc.expiresOn)}</span>
}

// "PDF · 1.2 MB · LDA/HS/2019/0442"
export const docLine = (doc, extra = []) => [kindLabel(doc.mime), formatSize(doc.size), ...extra, doc.note].filter(Boolean).join(" · ")

// File name, title and the document's name for downloads ("NOC for advertisement.pdf")
export const downloadName = (doc) => {
  const ext = doc.fileName?.match(/\.[a-z0-9]+$/i)?.[0] ?? ""
  return `${doc.title}${ext}`
}
export const downloadUrl = (doc) => `${doc.url}?download=1`

export function download(doc) {
  const a = document.createElement("a")
  a.href = downloadUrl(doc)
  a.download = downloadName(doc)
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function VersionTag({ version, className }) {
  if (!version || version < 2) return null
  return <span className={cn("rounded bg-muted px-1 py-px text-[10px] font-semibold text-muted-foreground tabular-nums", className)}>v{version}</span>
}
