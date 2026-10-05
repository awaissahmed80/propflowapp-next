"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toHex } from "@/lib/color"
import { vizColor } from "@/lib/chart-colors"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { contactsNavItem } from "../nav"
import { BarList, ContactTypeBadges } from "./contact-parts"
import { ContactDialog } from "./contact-dialog"

// Contacts › Overview: how big the directory is, what's new, and what needs tidying (missing
// CNICs, possible duplicates). Data: contactsOverview() (server/queries.js).
//   can: { create, review }

function ViewAll({ href, children = "View all" }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

function TileLink({ href, children }) {
  if (!href) return children
  return (
    <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:h-full [&>div]:transition-colors [&>div]:hover:border-primary/30">
      {children}
    </Link>
  )
}

function PersonRow({ c, meta, children }) {
  return (
    <li>
      <Link href={`/contacts/${urlCode(c.code)}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
        <Avatar name={c.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
        </span>
        {children}
      </Link>
    </li>
  )
}

export function ContactsOverview({ data: v, can }) {
  const router = useRouter()
  const types = useList("contact-type")
  const [adding, setAdding] = useState(false)
  const { title, description } = contactsNavItem("/contacts")

  const typeRows = v.types.map((t) => {
    const def = types.map[t.value]
    return { key: t.value, label: def?.label ?? t.value, icon: def?.icon, color: toHex(def?.color) ?? vizColor("blue"), count: t.count, href: `/contacts/type/${t.value}` }
  })
  const cityRows = v.cities.map((c) => ({ key: c.city || "-", label: c.city || "No city", icon: "map-pin-2-line", color: vizColor(c.city ? "teal" : "gray"), count: c.count }))

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          can.create && (
            <Button leftIcon="user-add-line" onClick={() => setAdding(true)}>
              New contact
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TileLink href="/contacts/all">
          <StatTile icon="contacts-book-2-line" label="Contacts" value={v.total.toLocaleString()} hint={`${v.multi} with more than one type`} />
        </TileLink>
        <StatTile icon="user-add-line" tone="sky" label="Added this month" value={v.month} hint={`${v.week} in the last 7 days`} />
        <TileLink href={types.map.customer ? "/contacts/type/customer" : null}>
          <StatTile icon="user-follow-line" tone="green" label="Customers" value={v.customers} hint="Have booked a unit" />
        </TileLink>
        <TileLink href={can.review ? "/contacts/missing-cnic" : null}>
          <StatTile
            icon="id-card-line"
            tone={v.missingCnic ? "amber" : "green"}
            label="Missing CNIC"
            value={v.missingCnic}
            hint={can.review ? (v.duplicates ? `${v.duplicates} possible duplicates to check` : "No duplicates found") : "Customers, owners and tenants"}
          />
        </TileLink>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="By type" action={<ViewAll href="/contacts/all">All contacts</ViewAll>}>
          {typeRows.length ? <BarList rows={typeRows} /> : <p className="text-sm text-muted-foreground">No contacts yet.</p>}
          <p className="mt-4 text-xs text-muted-foreground">One contact can have several types, e.g. a customer who is also enquiring about a new project.</p>
        </SectionCard>

        <SectionCard title="Recently added" bodyClassName="p-0" action={<ViewAll href="/contacts/all" />}>
          {v.recent.length ? (
            <ul className="divide-y">
              {v.recent.map((c) => (
                <PersonRow key={c.code} c={c} meta={timeAgo(c.createdAt)}>
                  <ContactTypeBadges types={c.types} max={1} />
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No contacts yet.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="By city">{cityRows.length ? <BarList rows={cityRows} /> : <p className="text-sm text-muted-foreground">No contacts yet.</p>}</SectionCard>

        <SectionCard className="xl:col-span-2" title={`Repeat enquirers · ${v.repeatCount}`} bodyClassName="p-0">
          {v.repeat.length ? (
            <ul className="divide-y">
              {v.repeat.map((c) => (
                <PersonRow key={c.code} c={c} meta={[formatPkPhone(c.phone), c.city].filter(Boolean).join(" · ")}>
                  <span className="hidden sm:flex">
                    <ContactTypeBadges types={c.types} max={2} />
                  </span>
                  <span className="w-24 text-right text-sm tabular-nums">
                    {c.leads.total} leads
                    <span className="block text-xs text-muted-foreground">{c.leads.open} open</span>
                  </span>
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody has enquired more than once yet.</p>
          )}
        </SectionCard>
      </div>

      {adding && <ContactDialog onClose={() => setAdding(false)} onSaved={(code) => router.push(`/contacts/${urlCode(code)}`)} />}
    </div>
  )
}
