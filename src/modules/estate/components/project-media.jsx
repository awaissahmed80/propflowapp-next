"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, formatSize } from "@/lib/format"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { attachProjectFiles, removeProjectFile, setProjectCover, updateProjectFile, uploadProjectFile } from "../server/files"
import { AssetManager } from "@/components/assets/asset-manager"
import { Lightbox } from "@/components/ui/lightbox"

// Project photos (one is the cover) and documents (layout plan, NOC…), added after the project
// is created. Files upload one at a time so each stays under the 10 MB limit.

function useAct() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const act = (fn) =>
    startTransition(async () => {
      setError("")
      const result = await fn()
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  return { act, pending, error, setError, refresh: () => router.refresh() }
}

// Library filters for a project's file manager
const scopesFor = (project) => [
  {
    value: "here",
    label: "This project",
    ownerType: "project",
    ownerCode: project.code,
  },
  { value: "all", label: "All workspace files" },
]

export function ProjectPhotos({ project, canEdit }) {
  const { act, pending, error, refresh } = useAct()
  const [managing, setManaging] = useState(false)
  const [viewing, setViewing] = useState(null) // photo index in the lightbox
  const images = project.images
  return (
    <div className="space-y-4 pt-2">
      {error && <Notice tone="error">{error}</Notice>}
      {canEdit && (
        <div className="flex justify-end">
          <Button leftIcon="image-add-line" onClick={() => setManaging(true)}>
            Add photos
          </Button>
        </div>
      )}
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
          {images.map((img, i) => (
            <figure key={img.code} className="group relative overflow-hidden rounded-xl border bg-muted">
              <button type="button" onClick={() => setViewing(i)} aria-label={`View ${img.title}`} className="block aspect-[4/3] w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
                <img src={img.url} alt={img.title} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              </button>
              {img.isCover && (
                <Badge color="#1528a0" className="absolute top-2 left-2 bg-background/90 shadow-sm backdrop-blur">
                  <Icon name="star-fill" /> Cover
                </Badge>
              )}
              {canEdit && (
                <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <DropdownMenu
                    align="end"
                    items={[
                      ...(img.isCover
                        ? []
                        : [
                            {
                              label: "Make cover",
                              icon: "star-line",
                              onClick: () => act(() => setProjectCover(img.code)),
                            },
                          ]),
                      { label: "View", icon: "eye-line", onClick: () => setViewing(i) },
                      { type: "separator" },
                      {
                        label: "Remove",
                        icon: "delete-bin-6-line",
                        variant: "destructive",
                        onClick: () => act(() => removeProjectFile(img.code)),
                      },
                    ]}
                    trigger={<Button size="smicon" variant="outline" leftIcon="more-2-line" aria-label={`${img.title} actions`} disabled={pending} className="bg-background/90 backdrop-blur" />}
                  />
                </div>
              )}
              <figcaption className="truncate px-3 py-2 text-xs text-muted-foreground">{img.title}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
          No photos yet.
          {canEdit ? " Add some; the first becomes the cover." : ""}
        </p>
      )}
      {viewing != null && <Lightbox images={images} index={viewing} onClose={() => setViewing(null)} />}
      {managing && (
        <AssetManager
          title={`Add photos to ${project.name}`}
          collection="images"
          accept="image/jpeg,image/png,image/webp"
          uploadHint="JPG, PNG or WebP, up to 10 MB each. The first photo becomes the cover."
          scopes={scopesFor(project)}
          upload={(data) => {
            data.set("collection", "images")
            return uploadProjectFile(project.code, data)
          }}
          attach={(codes) => attachProjectFiles(project.code, codes, { collection: "images" })}
          onClose={() => setManaging(false)}
          onDone={refresh}
        />
      )}
    </div>
  )
}

function DocumentDialog({ doc, onClose }) {
  const router = useRouter()
  const types = useList("project-document-type")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [title, setTitle] = useState(doc.title)
  const [category, setCategory] = useState(doc.category ?? types.defaultValue ?? "")
  const save = () =>
    startTransition(async () => {
      setError("")
      const result = await updateProjectFile(doc.code, { title, category })
      if (result?.error) setError(result.error)
      else {
        onClose()
        router.refresh()
      }
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Document details"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} leftIcon="save-3-line" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <LookupSelect list="project-document-type" label="Type" value={category} onChange={setCategory} />
      <p className="text-xs text-muted-foreground">File: {doc.fileName}</p>
    </Dialog>
  )
}

export function ProjectDocuments({ project, canEdit }) {
  const types = useList("project-document-type")
  const { act, pending, error, refresh } = useAct()
  const [category, setCategory] = useState(types.defaultValue ?? types.options[0]?.value ?? "")
  const [editing, setEditing] = useState(null)
  const [managing, setManaging] = useState(false)
  const docs = project.documents
  return (
    <div className="space-y-4 pt-2">
      {error && <Notice tone="error">{error}</Notice>}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" leftIcon="list-settings-line" nativeButton={false} render={<Link href="/estate/lists?list=project-document-type" />}>
            Edit document types
          </Button>
          <Button leftIcon="file-add-line" onClick={() => setManaging(true)}>
            Add documents
          </Button>
        </div>
      )}
      {docs.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {docs.map((d) => (
            <li key={d.code} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
                <Icon name={types.map[d.category]?.icon ?? (d.mime === "application/pdf" ? "file-pdf-2-line" : "image-line")} />
              </span>
              <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:text-primary">
                <span className="block truncate text-sm font-medium">{d.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[types.label(d.category), d.mime === "application/pdf" ? "PDF" : "Image", formatSize(d.size), formatDate(d.createdAt)].filter(Boolean).join(" · ")}
                </span>
              </a>
              <Button size="smicon" variant="ghost" leftIcon="download-2-line" aria-label={`Download ${d.title}`} nativeButton={false} render={<a href={`${d.url}?download=1`} />} />
              {canEdit && (
                <DropdownMenu
                  align="end"
                  items={[
                    {
                      label: "Edit details",
                      icon: "edit-line",
                      onClick: () => setEditing(d),
                    },
                    { type: "separator" },
                    {
                      label: "Remove",
                      icon: "delete-bin-6-line",
                      variant: "destructive",
                      onClick: () => act(() => removeProjectFile(d.code)),
                    },
                  ]}
                  trigger={<Button size="smicon" variant="ghost" leftIcon="more-2-line" aria-label={`${d.title} actions`} disabled={pending} />}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
          No documents yet.
          {canEdit ? " Add the layout plan, NOC and brochures." : ""}
        </p>
      )}
      {editing && <DocumentDialog doc={editing} onClose={() => setEditing(null)} />}
      {managing && (
        <AssetManager
          title={`Add documents to ${project.name}`}
          collection="documents"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          uploadHint="PDFs or scans (JPG, PNG, WebP), up to 10 MB each."
          scopes={scopesFor(project)}
          extra={<LookupSelect list="project-document-type" label="File under" value={category} onChange={setCategory} />}
          upload={(data) => {
            data.set("collection", "documents")
            data.set("category", category)
            return uploadProjectFile(project.code, data)
          }}
          attach={(codes) =>
            attachProjectFiles(project.code, codes, {
              collection: "documents",
              category,
            })
          }
          onClose={() => setManaging(false)}
          onDone={refresh}
        />
      )}
    </div>
  )
}
