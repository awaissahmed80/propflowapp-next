"use client"

import { PdfViewer } from "@/components/assets/pdf-viewer"
import { DocIcon, fileKind, kindLabel } from "./doc-parts"

// The shared document on its public page: PDFs page by page, photos as they are, other files
// (Word, Excel) just their icon, to download
export function SharePreview({ url, mime, title }) {
  const kind = fileKind(mime)
  if (kind === "pdf") return <PdfViewer url={url} className="h-[75svh] min-h-96 rounded-xl border bg-slate-100" />
  if (kind === "image")
    return (
      <div className="flex justify-center rounded-xl border bg-slate-100 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a shared file, served by our own route */}
        <img src={url} alt={title} className="max-h-[75svh] max-w-full rounded object-contain" />
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-white px-6 py-16 text-center">
      <DocIcon mime={mime} className="size-16 text-4xl" />
      <p className="text-sm text-slate-600">This {kindLabel(mime)} file can&apos;t be shown here. Download it to open it.</p>
    </div>
  )
}
