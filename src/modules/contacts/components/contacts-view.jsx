"use client"

import { DataMenu } from "@/modules/data-io/components/data-menu"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { downloadExcel } from "@/lib/export-excel"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { matchesSearch } from "../review"
import { exportContacts } from "../server/actions"
import { Banner, ContactTypeBadges } from "./contact-parts"
import { ContactDialog } from "./contact-dialog"

// Contacts › All contacts, one type, or Missing CNIC: the directory as a table, searched by
// name, email, company or code, and by 4+ digits of a mobile or CNIC. Data: contactsList().
//   page: { title, description, empty, banner? } · type: the type this list is (new contacts get it)
//   can: { create, export } · workspace / me: for the export's heading

const EMPTY = { type: [], city: [], overseas: [], whatsapp: [] }

export function ContactsView({ rows, total, page, type = null, can, workspace, me }) {
  const router = useRouter()
  const types = useList("contact-type")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(EMPTY)
  const [adding, setAdding] = useState(false)
  const [exporting, startExport] = useTransition()

  const groups = useMemo(
    () => [
      ...(type ? [] : [{ key: "type", label: "Type", icon: "price-tag-3-line", options: types.values.map((t) => ({ value: t.value, label: t.label })) }]),
      {
        key: "city",
        label: "City",
        icon: "map-pin-2-line",
        options: [...new Set(rows.map((c) => c.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
      },
      {
        key: "overseas",
        label: "Overseas",
        icon: "plane-line",
        options: [
          { value: "yes", label: "Overseas Pakistanis" },
          { value: "no", label: "In Pakistan" },
        ],
      },
      {
        key: "whatsapp",
        label: "WhatsApp",
        icon: "whatsapp-line",
        options: [
          { value: "yes", label: "On WhatsApp" },
          { value: "no", label: "Not on WhatsApp" },
        ],
      },
    ],
    [rows, type, types.values],
  )

  const visible = useMemo(
    () =>
      rows.filter((c) => {
        if (filters.type.length && !filters.type.some((t) => c.types.includes(t))) return false
        if (filters.city.length && !filters.city.includes(c.city)) return false
        if (filters.overseas.length && !filters.overseas.includes(c.overseas ? "yes" : "no")) return false
        if (filters.whatsapp.length && !filters.whatsapp.includes(c.whatsapp ? "yes" : "no")) return false
        return matchesSearch(c, search)
      }),
    [rows, filters, search],
  )
  const filtered = Boolean(search.trim()) || Object.values(filters).some((f) => f.length)

  const exportExcel = () =>
    startExport(async () => {
      const r = await toastAction(() => exportContacts(visible.map((c) => c.code)), { loading: "Preparing the export…" })
      if (!r?.rows) return
      const report = {
        title: `Contacts - ${page.title}`,
        columns: [
          { key: "code", header: "Code", width: 11 },
          { key: "name", header: "Name", width: 26 },
          { key: "types", header: "Type", width: 22 },
          { key: "phone", header: "Mobile", width: 16 },
          { key: "whatsapp", header: "WhatsApp", width: 10 },
          { key: "cnic", header: "CNIC", width: 17 },
          { key: "guardian", header: "S/O, D/O, W/O", width: 24 },
          { key: "email", header: "Email", width: 28 },
          { key: "company", header: "Company", width: 22 },
          { key: "designation", header: "Designation", width: 16 },
          { key: "city", header: "City", width: 14 },
          { key: "overseas", header: "Overseas", width: 10 },
          { key: "address", header: "Address", width: 34 },
          { key: "added", header: "Added", width: 13 },
        ],
      }
      const out = r.rows.map((c) => ({ ...c, phone: formatPkPhone(c.phone), types: c.types.map((t) => types.label(t)).join(", "), added: formatDate(c.createdAt) }))
      await downloadExcel(report, { rows: out, summary: [{ label: "Contacts", value: out.length }] }, [workspace, `Exported ${formatDate(new Date())} by ${me}`].filter(Boolean))
    })

  const columns = [
    {
      key: "name",
      header: "Contact",
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} />
          <div className="min-w-0">
            <Link href={`/contacts/${urlCode(c.code)}`} className="block truncate font-medium transition-colors group-hover:text-primary">
              {c.name}
            </Link>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground tabular-nums">
              {c.phone ? formatPkPhone(c.phone) : "No mobile"}
              {c.phone && c.whatsapp && <Icon name="whatsapp-line" className="text-emerald-600 dark:text-emerald-400" aria-label="On WhatsApp" />}
              {c.overseas && <Icon name="plane-line" aria-label="Overseas" />}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "types",
      header: "Type",
      sortValue: (c) => types.label(c.types[0] ?? ""),
      cell: (c) => (c.types.length ? <ContactTypeBadges types={c.types} max={2} /> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "company",
      header: "Company · city",
      sortValue: (c) => c.company ?? c.city ?? "",
      cell: (c) => (
        <div className="min-w-0">
          <span className="block max-w-56 truncate">{c.company ?? c.city ?? "—"}</span>
          {c.company && <span className="block max-w-56 truncate text-xs text-muted-foreground">{[c.designation, c.city].filter(Boolean).join(" · ")}</span>}
        </div>
      ),
    },
    {
      key: "cnic",
      header: "CNIC",
      className: "whitespace-nowrap font-mono text-xs",
      sortValue: (c) => c.cnic ?? "",
      cell: (c) => c.cnic ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "leads",
      header: "Leads",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (c) => c.leads.total,
      cell: (c) =>
        c.leads.total ? (
          <span>
            {c.leads.total}
            {c.leads.open > 0 && <span className="ml-1 text-xs text-muted-foreground">({c.leads.open} open)</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "bookings",
      header: "Bookings",
      className: "text-right tabular-nums",
      sortValue: (c) => c.bookings,
      cell: (c) => c.bookings || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "added",
      header: "Added",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (c) => new Date(c.createdAt).getTime(),
      cell: (c) => timeAgo(c.createdAt),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title={page.title}
          description={page.description ?? (rows.length === total ? `${total.toLocaleString()} people and firms, shared by every app` : `${rows.length.toLocaleString()} of ${total.toLocaleString()} contacts`)}
          toolbar={
            <>
              <div className="min-w-32 flex-1 sm:max-w-80">
                <Input
                  type="search"
                  placeholder="Name, mobile, CNIC, email or company…"
                  aria-label="Search contacts"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  startElement={<Icon name="search-line" />}
                />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
          info={filtered ? `${visible.length.toLocaleString()} shown` : null}
          actions={
            <>
              {can.export && <IconButton icon="file-excel-2-line" variant="outline" tooltip="Export what's shown to Excel" disabled={!visible.length || exporting} onClick={exportExcel} />}
              <DataMenu entity="contacts" can={{ import: can.create, export: can.export }} />
              {can.create && (
                <Button leftIcon="user-add-line" onClick={() => setAdding(true)}>
                  New contact
                </Button>
              )}
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
        {page.banner && <Banner>{page.banner}</Banner>}
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(c) => c.code}
          minWidth="64rem"
          onRowClick={(c) => router.push(`/contacts/${urlCode(c.code)}`)}
          empty={<p className="text-sm text-muted-foreground">{filtered ? "No contacts match." : page.empty}</p>}
        />
      </div>
      {adding && <ContactDialog defaultType={type ?? undefined} onClose={() => setAdding(false)} onSaved={(code) => router.push(`/contacts/${urlCode(code)}`)} />}
    </div>
  )
}
