"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { EXPIRY_FILTERS } from "../expiry"
import { DocIcon, ExpiryBadge, VersionTag, docLine } from "./doc-parts"
import { UploadDialog, useDocumentActions } from "./document-dialogs"

// A list of company documents: All documents, or one type (from the sidebar).
//   docs: listDocuments() · type: the sidebar's type (null on All documents) · title, description
//   projects: [{ code, name }] · can: { create, edit, delete, expiry, share }

export function DocumentsView({ docs, type = null, title, description, projects, can }) {
  const router = useRouter()
  const types = useList("document-type")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ type: [], project: [], expiry: [], uploader: [] })
  const [uploading, setUploading] = useState(false)
  const actions = useDocumentActions({ can, projects })

  const uploaders = useMemo(
    () => [...new Map(docs.filter((d) => d.uploader).map((d) => [d.uploader.id, d.uploader.name])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    [docs],
  )
  const groups = [
    ...(type ? [] : [{ key: "type", label: "Type", icon: "folder-line", options: types.values.filter((t) => docs.some((d) => d.type === t.value)).map((t) => ({ value: t.value, label: t.label, icon: t.icon })) }]),
    { key: "project", label: "Project", icon: "community-line", options: [{ value: "", label: "Not project-specific" }, ...projects.map((p) => ({ value: p.code, label: p.name }))] },
    ...(can.expiry ? [{ key: "expiry", label: "Expiry", icon: "alarm-warning-line", options: EXPIRY_FILTERS }] : []),
    { key: "uploader", label: "Uploaded by", icon: "user-line", options: uploaders },
  ]
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return docs.filter((d) => {
      if (filters.type.length && !filters.type.includes(d.type)) return false
      if (filters.project.length && !filters.project.includes(d.project?.code ?? "")) return false
      if (filters.expiry.length && !filters.expiry.includes(d.expiry ?? "none")) return false
      if (filters.uploader.length && !filters.uploader.includes(d.uploader?.id)) return false
      return !term || [d.title, d.note, d.fileName, d.project?.name].some((x) => x?.toLowerCase().includes(term))
    })
  }, [docs, q, filters])

  const open = (d) => router.push(`/documents/${d.code}`)
  const columns = [
    {
      key: "name",
      header: "Name",
      sortValue: (d) => d.title.toLowerCase(),
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-3">
          <DocIcon mime={d.mime} />
          <span className="min-w-0">
            <Link href={`/documents/${d.code}`} className="flex items-center gap-1.5 font-medium hover:text-primary">
              <span className="truncate">{d.title}</span>
              <VersionTag version={d.version} />
            </Link>
            <span className="block max-w-[32rem] truncate text-xs text-muted-foreground">{docLine(d)}</span>
          </span>
        </span>
      ),
    },
    ...(type
      ? []
      : [
          {
            key: "type",
            header: "Type",
            sortValue: (d) => types.label(d.type),
            cell: (d) => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Icon name={types.map[d.type]?.icon ?? "folder-line"} className="text-muted-foreground" />
                {types.label(d.type)}
              </span>
            ),
          },
        ]),
    {
      key: "project",
      header: "Project",
      sortValue: (d) => d.project?.name ?? "",
      cell: (d) => (d.project ? <span className="whitespace-nowrap">{d.project.name}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "added",
      header: "Added",
      className: "whitespace-nowrap",
      sortValue: (d) => new Date(d.addedAt).getTime(),
      cell: (d) => (
        <span>
          {formatDate(d.addedAt)}
          <span className="block text-xs text-muted-foreground">{d.uploader?.name ?? ""}</span>
        </span>
      ),
    },
    ...(can.expiry ? [{ key: "expiry", header: "Expiry", sortValue: (d) => d.daysLeft ?? 1e9, cell: (d) => <ExpiryBadge doc={d} plain /> }] : []),
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (d) => (
        <span className="flex justify-end">
          <DropdownMenu align="end" items={actions.menu(d)} trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${d.title}`} tooltip={false} />} />
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search documents" placeholder="Name, note or project…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        info={`${docs.length} ${docs.length === 1 ? "document" : "documents"}`}
        actions={
          can.create && (
            <Button leftIcon="upload-2-line" onClick={() => setUploading(true)}>
              Upload
            </Button>
          )
        }
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(d) => d.code}
          minWidth={type ? "52rem" : "62rem"}
          onRowClick={open}
          empty={
            docs.length ? (
              <p className="text-sm text-muted-foreground">No document matches.</p>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Icon name="folder-open-line" className="text-3xl text-muted-foreground" />
                <p className="text-sm font-medium">Nothing here yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">Approvals, agreements, licenses and the rest: upload them once and find them in seconds.</p>
                {can.create && (
                  <Button className="mt-1" variant="outline" leftIcon="upload-2-line" onClick={() => setUploading(true)}>
                    Upload documents
                  </Button>
                )}
              </div>
            )
          }
        />
      </div>
      {uploading && (
        <UploadDialog
          type={type}
          projects={projects}
          can={can}
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false)
            router.refresh()
          }}
        />
      )}
      {actions.dialogs}
    </div>
  )
}
