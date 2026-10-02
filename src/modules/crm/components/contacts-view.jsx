"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { urlCode } from "@/lib/url"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { AgentChip, LeadStatusBadge } from "./lead-parts"
import { ContactTypeBadges } from "./contact-types"

// CRM › Contacts: the people behind the leads (one per mobile), laid out like the Contacts app's
// All contacts. A row opens the contact (/crm/contacts/ct-00012). Data: leadContacts() (server/queries.js).
const EMPTY = { city: [], whatsapp: [], state: [] }
const digits = (s) => String(s ?? "").replace(/\D/g, "")

export function ContactsView({ contacts, scope }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState(EMPTY)

  const groups = useMemo(
    () => [
      {
        key: "state",
        label: "Enquiries",
        icon: "user-star-line",
        options: [
          { value: "open", label: "Has an open lead" },
          { value: "booked", label: "Has booked" },
          { value: "repeat", label: "More than one enquiry" },
        ],
      },
      {
        key: "city",
        label: "City",
        icon: "map-pin-2-line",
        options: [...new Set(contacts.map((c) => c.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
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
    [contacts],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qd = digits(q)
    return contacts.filter((c) => {
      if (filters.city.length && !filters.city.includes(c.city)) return false
      if (filters.whatsapp.length && !filters.whatsapp.includes(c.whatsapp ? "yes" : "no")) return false
      if (filters.state.includes("open") && !c.open) return false
      if (filters.state.includes("booked") && !c.booked) return false
      if (filters.state.includes("repeat") && c.leads < 2) return false
      if (!q) return true
      return [c.name, c.email, c.city].some((v) => v?.toLowerCase().includes(q)) || (qd.length >= 4 && digits(c.phone).includes(qd.replace(/^0/, "")))
    })
  }, [contacts, filters, search])

  const columns = [
    {
      key: "name",
      header: "Contact",
      sortValue: (c) => c.name.toLowerCase(),
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} />
          <div className="min-w-0">
            <span className="block truncate font-medium transition-colors group-hover:text-primary">{c.name}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground tabular-nums">
              {formatPkPhone(c.phone)}
              {c.whatsapp && <Icon name="whatsapp-line" className="text-emerald-600 dark:text-emerald-400" aria-label="On WhatsApp" />}
            </span>
          </div>
        </div>
      ),
    },
    { key: "types", header: "Type", sortValue: (c) => c.types.join(), cell: (c) => <ContactTypeBadges types={c.types} max={2} /> },
    {
      key: "city",
      header: "City · interested in",
      sortValue: (c) => c.city ?? "",
      cell: (c) => (
        <div className="min-w-0">
          <span className="block truncate">{[c.city, c.overseas && "Overseas"].filter(Boolean).join(" · ") || "—"}</span>
          <span className="block max-w-64 truncate text-xs text-muted-foreground">{c.projects.join(", ") || "No project yet"}</span>
        </div>
      ),
    },
    {
      key: "leads",
      header: "Leads",
      className: "tabular-nums",
      sortValue: (c) => c.leads,
      cell: (c) => (
        <span>
          {c.leads}
          {c.open ? <span className="ml-1 text-xs text-muted-foreground">({c.open} open)</span> : null}
        </span>
      ),
    },
    {
      key: "latest",
      header: "Latest enquiry",
      sortValue: (c) => c.latest.status,
      cell: (c) => (
        <span className="flex items-center gap-1.5">
          <LeadStatusBadge status={c.latest.status} />
          {c.latest.archived && <span className="text-xs text-muted-foreground">Archived</span>}
        </span>
      ),
    },
    ...(scope === "own" ? [] : [{ key: "agent", header: "Agent", sortValue: (c) => c.agent?.name ?? "~", cell: (c) => <AgentChip agent={c.agent} /> }]),
    {
      key: "contact",
      header: "Last contact",
      className: "whitespace-nowrap text-muted-foreground",
      sortValue: (c) => (c.lastContactAt ? new Date(c.lastContactAt).getTime() : 0),
      cell: (c) => (c.lastContactAt ? timeAgo(c.lastContactAt) : "Never"),
    },
    { key: "since", header: "First enquiry", className: "whitespace-nowrap text-muted-foreground", sortValue: (c) => new Date(c.firstAt).getTime(), cell: (c) => timeAgo(c.firstAt) },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <PageHeader
          title="Contacts"
          description={`${contacts.length} ${contacts.length === 1 ? "person" : "people"} behind your leads`}
          toolbar={
            <>
              <div className="min-w-32 flex-1 sm:max-w-80">
                <Input type="search" placeholder="Name, mobile, email or city…" aria-label="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
              </div>
              <FilterMenu groups={groups} value={filters} onChange={setFilters} />
            </>
          }
        />
        <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      </div>
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(c) => c.code}
          minWidth="62rem"
          defaultSort={{ key: "since", dir: "desc" }}
          onRowClick={(c) => router.push(`/crm/contacts/${urlCode(c.code)}`)}
          empty={<p className="text-sm text-muted-foreground">{search || Object.values(filters).some((v) => v.length) ? "No contacts match." : "No contacts yet. They appear here as leads come in."}</p>}
        />
      </div>
    </div>
  )
}
