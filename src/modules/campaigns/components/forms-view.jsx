"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { percent } from "../constants"
import { FormNewDialog } from "./form-new-dialog"

// Campaigns › Lead Forms: every form with its views, entries and conversion; a new one opens the builder
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const href = (f) => `/campaigns/forms/${urlCode(f.code)}`

export function FormStatusBadge({ status }) {
  return status === "active" ? (
    <Badge color="green" dot>
      Accepting entries
    </Badge>
  ) : (
    <Badge color="amber" dot>
      Paused
    </Badge>
  )
}

export function FormsView({ forms, campaigns = [], projects = [], canCreate = false }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState("")
  const [adding, setAdding] = useState(() => canCreate && params.get("new") === "1")

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return forms.filter((f) => !term || [f.name, f.code, f.campaign?.name, f.project?.name].some((v) => v?.toLowerCase().includes(term)))
  }, [forms, q])

  const columns = [
    {
      key: "name",
      header: "Form",
      sortValue: (f) => f.name.toLowerCase(),
      cell: (f) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="survey-line" />
          </span>
          <div className="min-w-0">
            <Link href={href(f)} className="block truncate font-medium transition-colors group-hover:text-primary">
              {f.name}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">{[f.code, f.campaign?.name ?? "No campaign", `${f.fields.length} ${f.fields.length === 1 ? "question" : "questions"}`].join(" · ")}</span>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (f) => f.status, cell: (f) => <FormStatusBadge status={f.status} /> },
    { key: "views", header: "Views", className: "text-right tabular-nums", sortValue: (f) => f.views, cell: (f) => number(f.views) },
    { key: "entries", header: "Entries", className: "text-right tabular-nums", sortValue: (f) => f.entries, cell: (f) => <span className="font-medium">{number(f.entries)}</span> },
    { key: "conversion", header: "Conversion", className: "text-right tabular-nums", sortValue: (f) => f.conversion ?? -1, cell: (f) => percent(f.conversion) },
    {
      key: "last",
      header: "Last entry",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (f) => (f.lastEntryAt ? new Date(f.lastEntryAt).getTime() : 0),
      cell: (f) => (f.lastEntryAt ? timeAgo(f.lastEntryAt) : "—"),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Lead Forms"
        description="Every entry becomes a CRM lead, linked to its contact, campaign and channel"
        toolbar={
          <div className="min-w-32 flex-1 sm:max-w-80">
            <Input type="search" placeholder="Form or campaign…" aria-label="Search forms" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        actions={
          canCreate && (
            <Button leftIcon="add-line" onClick={() => setAdding(true)}>
              New form
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1">
        {forms.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed bg-background p-10 text-center">
            <Icon name="survey-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No lead forms yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add a form, embed it on your website or share its link, and every entry arrives in CRM as a lead.</p>
            {canCreate && (
              <Button className="mt-4" leftIcon="add-line" onClick={() => setAdding(true)}>
                New form
              </Button>
            )}
          </div>
        ) : (
          <DataTable columns={columns} rows={shown} rowKey={(f) => f.code} minWidth="52rem" onRowClick={(f) => router.push(href(f))} empty={<p className="text-sm text-muted-foreground">No forms match.</p>} />
        )}
      </div>
      {adding && <FormNewDialog campaigns={campaigns} projects={projects} onClose={() => setAdding(false)} onCreated={(code) => router.push(`/campaigns/forms/${urlCode(code)}`)} />}
    </div>
  )
}
