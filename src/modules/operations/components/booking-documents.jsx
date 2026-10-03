"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { FileIcon, FilePreviewDialog } from "@/components/assets/file-preview-dialog"
import { FolderFilesDialog } from "@/components/assets/folder-files-dialog"
import { removeBookingDocument, setBookingDocumentFiles, uploadBookingDocuments } from "../server/bookings"

// A booking's Documents tab: the checklist from Sales › Customize › Booking documents (grouped by
// the step they're needed before), what's uploaded for each, and the generated documents.
// Every file in the folder is still reachable from each item's file manager.
//   onOpenDoc("statement" | "allotment"): opens a generated document's print preview

const GATE_LABEL = { allotment: "Before the allotment letter", handover: "Before handover", possession: "Before possession", "": "Other documents" }
const SOURCE = { document: "Document", proof: "Proof of payment", activity: "Activity", voice: "Voice note" }

export function BookingDocuments({ booking: b, canEdit, onOpenDoc }) {
  const router = useRouter()
  const [preview, setPreview] = useState(null) // index into the folder list, newest first
  const [managing, setManaging] = useState(null) // the checklist item whose file manager is open
  const [, startTransition] = useTransition()
  const d = b.documents
  const newest = [...d.files].reverse()
  const gates = ["allotment", "handover", "possession", ""]

  const remove = async (f) => {
    if (!(await confirm({ title: `Remove “${f.name}”?`, description: `The file is taken out of ${b.code}'s documents. This can't be undone.`, confirmLabel: "Remove file", destructive: true }))) return
    startTransition(async () => {
      const r = await removeBookingDocument(b.code, f.code)
      if (r?.error) toast.error(r.error)
      else {
        toast.success("Removed.")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      {gates.map((gate) => {
        const items = d.checklist.filter((c) => (c.gate ?? "") === gate)
        if (!items.length) return null
        return (
          <section key={gate || "other"}>
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{GATE_LABEL[gate]}</h3>
            <ul className="divide-y rounded-xl border bg-background shadow-xs">
              {items.map((c) => (
                <li key={c.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg text-base",
                        c.files.length ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon name={c.files.length ? "checkbox-circle-line" : (c.icon ?? "file-line")} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{c.label}</span>
                      <span className="text-xs text-muted-foreground">{c.files.length ? `${c.files.length} ${c.files.length === 1 ? "file" : "files"}` : c.required ? "Not uploaded yet" : "Optional"}</span>
                    </span>
                    {c.required && !c.files.length && (
                      <Badge color={d.enforce ? "amber" : "gray"} className="shrink-0">
                        Required
                      </Badge>
                    )}
                    {canEdit && (
                      <Button size="sm" variant="outline" leftIcon={c.files.length ? "folder-open-line" : "upload-2-line"} onClick={() => setManaging(c)}>
                        {c.files.length ? "Manage" : "Upload"}
                      </Button>
                    )}
                  </div>
                  {c.files.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5 pl-11">
                      {c.files.map((f) => (
                        <li key={f.code} className="flex max-w-64 items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2 text-xs">
                          <FileIcon mime={f.mime} />
                          <button type="button" onClick={() => setPreview(newest.findIndex((x) => x.code === f.code))} className="cursor-pointer truncate hover:text-primary hover:underline">
                            {f.name}
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={`Remove ${f.name}`}
                              onClick={() => remove(f)}
                              className="flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Icon name="close-line" className="text-[11px]" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Generated</h3>
        <ul className="divide-y rounded-xl border bg-background shadow-xs">
          {[
            { key: "statement", label: "Statement of account", icon: "file-list-3-line", ready: true },
            { key: "allotment", label: `Allotment letter${b.allotment ? ` ${b.allotment.no}` : ""}`, icon: "file-paper-2-line", ready: Boolean(b.allotment) },
          ].map((g) => (
            <li key={g.key} className="flex items-center gap-3 px-4 py-2.5">
              <Icon name={g.icon} className="text-lg text-muted-foreground" />
              <span className="min-w-0 flex-1 text-sm">{g.label}</span>
              {g.ready ? (
                <button type="button" onClick={() => onOpenDoc(g.key)} className="cursor-pointer text-sm font-medium text-primary hover:underline">
                  Open
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Once issued</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      {preview != null && <FilePreviewDialog files={newest} index={preview} onClose={() => setPreview(null)} />}
      {managing && <DocumentFiles booking={b} item={managing} onClose={() => setManaging(null)} />}
    </div>
  )
}

// File manager for one checklist item: the booking's folder; uploads are filed as this document,
// and ticking a file already there (a proof, an activity attachment) files it too
function DocumentFiles({ booking: b, item, onClose }) {
  const router = useRouter()
  const types = Object.fromEntries(b.documents.checklist.map((c) => [c.key, c.label]))
  return (
    <FolderFilesDialog
      title={`Upload — ${item.label}`}
      description={`Select or upload files for ${item.label}.`}
      folder={{ name: b.code, label: "Booking folder" }}
      files={b.documents.files.map((f) => ({ ...f, hint: f.category ? types[f.category] : SOURCE[f.source] }))}
      initial={item.files.map((f) => f.code)}
      upload={async (form) => {
        const r = await uploadBookingDocuments(b.code, item.key, form)
        if (!r?.error) router.refresh()
        return r
      }}
      apply={async (codes) => {
        const r = await setBookingDocumentFiles(b.code, item.key, codes)
        if (r?.error) return r
        toast.success(`${item.label} updated.`)
        router.refresh()
      }}
      onClose={onClose}
    />
  )
}
