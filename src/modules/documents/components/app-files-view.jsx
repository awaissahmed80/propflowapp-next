"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDate, formatSize } from "@/lib/format"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { FilePreviewDialog } from "@/components/assets/file-preview-dialog"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { DocIcon, download, kindLabel } from "./doc-parts"

// Documents › From apps: files another app keeps on its records (project plans, booking papers,
// landing page images), read-only here; each links back to its record, where they're managed.
//   source: { label, description } · files: listAppFiles().files

export function AppFilesView({ source, files }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ kind: [] })
  const [open, setOpen] = useState(null)
  const groups = [{ key: "kind", label: "Kind", icon: "price-tag-3-line", options: [...new Set(files.map((f) => f.kind))].sort().map((k) => ({ value: k, label: k })) }]
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return files.filter((f) => (!filters.kind.length || filters.kind.includes(f.kind)) && (!term || [f.title, f.fileName, f.record.label, f.kind].some((x) => x?.toLowerCase().includes(term))))
  }, [files, q, filters])
  const preview = (f) => setOpen(shown.indexOf(f))

  const columns = [
    {
      key: "name",
      header: "Name",
      sortValue: (f) => f.title.toLowerCase(),
      cell: (f) => (
        <span className="flex min-w-0 items-center gap-3">
          <DocIcon mime={f.mime} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{f.title}</span>
              {f.isPrivate && <Icon name="lock-line" className="text-xs text-muted-foreground" aria-label="Private" />}
            </span>
            <span className="block max-w-[28rem] truncate text-xs text-muted-foreground">{[kindLabel(f.mime), formatSize(f.size), f.fileName].join(" · ")}</span>
          </span>
        </span>
      ),
    },
    { key: "kind", header: "Kind", sortValue: (f) => f.kind, cell: (f) => <Badge color="gray">{f.kind}</Badge> },
    {
      key: "record",
      header: "Belongs to",
      sortValue: (f) => f.record.label,
      cell: (f) => (
        <Link href={f.record.href} className="inline-flex max-w-64 items-center gap-1 text-primary hover:underline">
          <span className="truncate">{f.record.label}</span>
          <Icon name="arrow-right-up-line" className="shrink-0 text-xs" />
        </Link>
      ),
    },
    {
      key: "added",
      header: "Added",
      className: "whitespace-nowrap",
      sortValue: (f) => new Date(f.addedAt).getTime(),
      cell: (f) => (
        <span>
          {formatDate(f.addedAt)}
          <span className="block text-xs text-muted-foreground">{f.uploader ?? ""}</span>
        </span>
      ),
    },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (f) => (
        <span className="flex justify-end">
          <DropdownMenu
            align="end"
            items={[
              { label: "Open", icon: "eye-line", onClick: () => preview(f) },
              { label: "Download", icon: "download-2-line", onClick: () => download(f) },
              { label: "Go to record", icon: "arrow-right-up-line", onClick: () => router.push(f.record.href) },
            ]}
            trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${f.title}`} tooltip={false} />}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={source.label}
        description={`${source.description}. Read-only here: add or remove them on the record.`}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search files" placeholder="Name or record…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        info={`${files.length} ${files.length === 1 ? "file" : "files"}`}
      />
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(f) => f.code}
          minWidth="56rem"
          onRowClick={preview}
          empty={<p className="text-sm text-muted-foreground">{files.length ? "No file matches." : "No files yet."}</p>}
        />
      </div>
      {open != null && <FilePreviewDialog files={shown.map((f) => ({ url: f.url, name: f.title, mime: f.mime, size: f.size }))} index={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
