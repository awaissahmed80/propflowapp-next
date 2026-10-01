"use client"

import { useEffect, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { formatDate, formatSize } from "@/lib/format"
import { listAssetLibrary } from "@/server/assets/actions"
import { Notice } from "@/modules/users/components/user-parts"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { Uploader } from "./uploader"

// File manager for any record: upload new files, or pick ones already in the workspace.
//   collection   "images" | "documents"
//   upload(fd)   the app's upload action for one file → { ok } | { error }
//   attach(codes) the app's attach action → { ok, added } | { error }
//   scopes       library filters, e.g. [{ value: "here", label: "This project", ownerType, ownerCode }, { value: "all", label: "All files" }]
//   extra        controls shown above the actions (e.g. the document type to file under)
//   onDone()     after anything was added
export function AssetManager({ title, collection = "images", accept, uploadHint, upload, attach, scopes = [{ value: "all", label: "All workspace files" }], extra, onClose, onDone }) {
  const images = collection === "images"
  const [tab, setTab] = useState("upload")
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState(scopes.at(-1).value)
  const [items, setItems] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState("")
  const [loading, startLoading] = useTransition()
  const [adding, startAdding] = useTransition()

  // Library: reload when its filters change (debounced while typing)
  const where = scopes.find((x) => x.value === scope)
  const ownerType = where?.ownerType ?? null
  const ownerCode = where?.ownerCode ?? null
  useEffect(() => {
    if (tab !== "library") return
    const timer = setTimeout(
      () =>
        startLoading(async () => {
          setItems(
            await listAssetLibrary({
              collection,
              search,
              ownerType,
              ownerCode,
            }),
          )
        }),
      search ? 250 : 0,
    )
    return () => clearTimeout(timer)
  }, [tab, search, collection, ownerType, ownerCode])

  const toggle = (code) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  const add = () =>
    startAdding(async () => {
      setError("")
      const result = await attach([...selected])
      if (result?.error) setError(result.error)
      else {
        onDone?.()
        onClose()
      }
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(60rem,calc(100%-4rem))]"
      title={title}
      description={images ? "Upload new photos, or pick ones already in your workspace." : "Upload new documents, or pick ones already in your workspace."}
      footer={
        <>
          {extra && <div className="mr-auto w-full sm:w-64">{extra}</div>}
          <Button variant="outline" onClick={onClose}>
            {tab === "upload" ? "Close" : "Cancel"}
          </Button>
          {tab === "library" && (
            <Button leftIcon="check-line" disabled={!selected.size} loading={adding} onClick={add}>
              {selected.size ? `Add ${selected.size} selected` : "Select files"}
            </Button>
          )}
        </>
      }
    >
      <ToggleGroup
        value={tab}
        onChange={setTab}
        className="w-fit"
        options={[
          { value: "upload", label: "Upload new", icon: "upload-cloud-2-line" },
          {
            value: "library",
            label: "Choose from library",
            icon: "folder-open-line",
          },
        ]}
      />
      {error && <Notice tone="error">{error}</Notice>}

      {tab === "upload" ? (
        <div className="space-y-3">
          <Uploader
            accept={accept}
            label={images ? "Drop photos here, or click to choose" : "Drop documents here, or click to choose"}
            hint={uploadHint}
            upload={upload}
            className="min-h-64 py-12"
            onDone={(n) => {
              if (n) {
                onDone?.()
                onClose()
              }
            }}
          />
        </div>
      ) : (
        <div className="flex h-[min(28rem,60svh)] flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-40 flex-1">
              <Input type="search" placeholder="Search by name…" aria-label="Search files" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            {scopes.length > 1 && (
              <Select
                aria-label="Where"
                triggerClassName="w-48"
                value={scope}
                onChange={setScope}
                options={scopes.map((s) => ({
                  value: s.value,
                  label: s.label,
                }))}
              />
            )}
          </div>
          <ScrollView className="min-h-0 flex-1 rounded-lg border" viewportClassName="p-2">
            {!items || (loading && !items.length) ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Loading files…</p>
            ) : !items.length ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <Icon name="folder-open-line" className="text-3xl" />
                <p className="mt-2">{search ? `Nothing matches “${search}”.` : "No files here yet."}</p>
              </div>
            ) : images ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {items.map((f) => {
                  const on = selected.has(f.code)
                  return (
                    <button
                      key={f.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(f.code)}
                      title={[f.title, f.owner].filter(Boolean).join(" · ")}
                      className={cn(
                        "group relative overflow-hidden rounded-lg border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "border-primary ring-2 ring-primary" : "hover:border-primary/40",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
                      <img src={f.url} alt={f.title} loading="lazy" className="aspect-[4/3] w-full bg-muted object-cover" />
                      <span
                        className={cn(
                          "absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border text-xs",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-white/80 bg-black/30 text-transparent",
                        )}
                      >
                        <Icon name="check-line" />
                      </span>
                      <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">{f.owner ?? f.title}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((f) => {
                  const on = selected.has(f.code)
                  return (
                    <li key={f.code}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(f.code)}
                        className={cn("flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60", on && "bg-primary/5")}
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-input text-transparent")}>
                          <Icon name="check-line" />
                        </span>
                        <Icon name={f.mime === "application/pdf" ? "file-pdf-2-line" : "image-line"} className="text-lg text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[f.owner, formatSize(f.size), formatDate(f.createdAt)].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </ScrollView>
          <p className="text-xs text-muted-foreground">Picked files are added here too; removing them here later won&apos;t remove them anywhere else.</p>
        </div>
      )}
    </Dialog>
  )
}
