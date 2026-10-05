"use client"

import Link from "next/link"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toHex } from "@/lib/color"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Tabs } from "@/components/ui/tabs"
import { budgetText, interestText } from "../constants"
import { AgentChip, LeadStatusBadge, TempIcon, telHref, whatsappHref } from "./lead-parts"
import { ContactTypeBadges } from "./contact-types"

// CRM › Contacts › one person: everything about them across their leads (laid out like the
// Contacts app's contact page). Enquiries open in Leads. Data: contactDetail() (server/queries.js).

const leadHref = (code, archived) => `/crm/leads?lead=${urlCode(code)}${archived ? "&tab=archived" : ""}`
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Empty({ icon, text }) {
  return (
    <div className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
      <Icon name={icon} className="text-2xl" />
      <p className="mt-1">{text}</p>
    </div>
  )
}

function Lookup({ list, value }) {
  const v = useList(list).map[value]
  return (
    <Badge color={toHex(v?.color) ?? "gray"} dot>
      {v?.label ?? value}
    </Badge>
  )
}

export function ContactDetail({ contact: c }) {
  const types = useList("unit-type")
  const sources = useList("lead-source")
  const activityTypes = useList("activity-type")
  const outcomes = useList("activity-outcome")
  const open = c.enquiries.filter((l) => !l.archived && !["booked", "lost"].includes(l.status)).length
  const t = c.contact

  const tabs = [
    {
      value: "activity",
      label: "Activity",
      icon: "history-line",
      count: c.recent.length || null,
      content: c.recent.length ? (
        <ul className="divide-y rounded-xl border bg-background shadow-xs">
          {c.recent.map((a) => {
            const type = activityTypes.map[a.type]
            const outcome = a.outcome ? outcomes.map[a.outcome] : null
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-base"
                  style={{ color: toHex(type?.color), backgroundColor: `color-mix(in oklab, ${toHex(type?.color) ?? "#64748b"} 14%, transparent)` }}
                >
                  <Icon name={type?.icon ?? "chat-check-line"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{type?.label ?? a.type}</span>
                    {outcome && (
                      <span className="flex items-center gap-1 text-[13px]" style={{ color: toHex(outcome.color) }}>
                        {outcome.icon && <Icon name={outcome.icon} />}
                        {outcome.label}
                      </span>
                    )}
                    <span className="text-[13px] text-muted-foreground">
                      {timeAgo(a.at)}
                      {a.by && ` · ${a.by.name}`} ·{" "}
                      <Link href={leadHref(a.lead)} className="hover:text-primary">
                        {a.lead}
                      </Link>
                    </span>
                  </p>
                  {a.notes && <p className="mt-0.5 text-[13px] whitespace-pre-line text-muted-foreground">{a.notes}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty icon="history-line" text="No calls, messages or visits logged yet." />
      ),
    },
    {
      value: "leads",
      label: "Leads",
      icon: "user-star-line",
      count: c.enquiries.length,
      content: (
        <div className="space-y-3">
          <div className="divide-y rounded-xl border bg-background shadow-xs">
            {c.enquiries.map((l) => (
              <Link key={l.code} href={leadHref(l.code, l.archived)} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <TempIcon priority={l.priority} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium group-hover:text-primary">{interestText(l.interest, { typeLabel: types.label })}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[l.code, budgetText(l.interest, formatPkr), l.source && sources.label(l.source), `added ${timeAgo(l.createdAt)}`].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <AgentChip agent={l.agent} className="hidden w-40 md:flex" />
                {l.archived && <span className="text-xs text-muted-foreground">Archived</span>}
                <LeadStatusBadge status={l.status} />
              </Link>
            ))}
          </div>
          {c.hidden > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="lock-line" /> {c.hidden} more {c.hidden === 1 ? "lead is" : "leads are"} handled by other agents.
            </p>
          )}
        </div>
      ),
    },
    {
      value: "bookings",
      label: "Bookings",
      icon: "file-paper-2-line",
      count: c.bookings.length,
      content: c.bookings.length ? (
        <div className="divide-y rounded-xl border bg-background shadow-xs">
          {c.bookings.map((b) => (
            <Link key={b.code} href={leadHref(b.lead)} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-lg text-emerald-600 dark:text-emerald-400">
                <Icon name="trophy-line" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium group-hover:text-primary">
                  {b.project}, unit {b.unit}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {b.code} · {b.kind === "token" ? "Token" : "Full booking"} · {formatDate(b.bookedAt)}
                </span>
              </div>
              <span className="hidden w-28 text-right text-sm font-semibold tabular-nums sm:block">{formatPkr(b.agreedPrice)}</span>
              <Lookup list="booking-stage" value={b.stage} />
              <Lookup list="booking-status" value={b.status} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon="file-paper-2-line" text="No bookings yet." />
      ),
    },
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/crm/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Contacts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={c.name} size="xl" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{c.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <ContactTypeBadges types={c.types} />
                {c.company && <span>{[c.designation, c.company].filter(Boolean).join(", ")}</span>}
                <span className="text-xs tabular-nums">{c.code}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[plural(c.enquiries.length + c.hidden, "lead"), open > 0 && `${open} open`, c.bookings.length > 0 && plural(c.bookings.length, "booking"), `known since ${formatDate(c.since)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon="phone-line" nativeButton={false} render={<a href={telHref(c.phone)} />}>
              Call
            </Button>
            {c.whatsapp && (
              <Button variant="outline" leftIcon="whatsapp-line" nativeButton={false} render={<a href={whatsappHref(c.phone, c.name)} target="_blank" rel="noreferrer" />}>
                WhatsApp
              </Button>
            )}
            {c.email && (
              <Button variant="outline" leftIcon="mail-line" nativeButton={false} render={<a href={`mailto:${c.email}`} />}>
                Email
              </Button>
            )}
            {c.fullHref && (
              <Button variant="outline" rightIcon="arrow-right-up-line" nativeButton={false} render={<Link href={c.fullHref} />}>
                Full contact
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Tabs tabs={tabs} />
        </div>
        <aside className="space-y-6">
          <SectionCard title="Details">
            <div className="divide-y">
              <DetailRow icon="phone-line" label="Mobile">
                <span className="tabular-nums">{formatPkPhone(c.phone)}</span>
                {c.whatsapp && <span className="text-xs text-muted-foreground"> · WhatsApp</span>}
              </DetailRow>
              <DetailRow icon="mail-line" label="Email">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="break-all text-primary hover:underline">
                    {c.email}
                  </a>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow icon="bank-card-line" label="CNIC">
                <span className="font-mono">{c.cnic ?? "—"}</span>
              </DetailRow>
              <DetailRow icon="map-pin-2-line" label="Address">
                {[c.address, c.city, c.overseas && "Overseas"].filter(Boolean).join(", ") || "—"}
              </DetailRow>
              <DetailRow icon="megaphone-line" label="Came through">
                {c.sources.map((s) => sources.label(s)).join(", ") || "—"}
              </DetailRow>
              <DetailRow icon="calendar-2-line" label="First lead">
                {formatDate(c.since)}
              </DetailRow>
              <DetailRow icon="time-line" label="Last contact">
                {t.lastAt ? timeAgo(t.lastAt) : "Never"}
              </DetailRow>
            </div>
          </SectionCard>

          <SectionCard title="Contact so far" bodyClassName="p-0">
            <div className="grid grid-cols-4 divide-x">
              {[
                ["phone-line", "Calls", t.calls],
                ["whatsapp-line", "WhatsApp", t.whatsapp],
                ["team-line", "Meetings", t.meetings],
                ["map-pin-user-line", "Visits", t.visits],
              ].map(([icon, label, n]) => (
                <div key={label} className="flex flex-col items-center gap-0.5 px-1 py-3 text-center">
                  <Icon name={icon} className="text-base text-muted-foreground" />
                  <span className="font-semibold tabular-nums">{n}</span>
                  <span className="text-[12px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            {(t.planned > 0 || t.missed > 0 || t.emails > 0) && (
              <p className="border-t px-4 py-2.5 text-[13px] text-muted-foreground">
                {[t.planned > 0 && `${plural(t.planned, "follow-up")} planned`, t.missed > 0 && `${t.missed} missed`, t.emails > 0 && plural(t.emails, "email")].filter(Boolean).join(" · ")}
              </p>
            )}
          </SectionCard>

          {c.dealers.length > 0 && (
            <SectionCard title="Linked records" bodyClassName="p-0">
              <ul className="divide-y">
                {c.dealers.map((d) => (
                  <li key={d.code} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon name="shake-hands-line" className="text-base text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Dealer firm</span>
                      <span className="block truncate text-sm">
                        {d.name}
                        {!d.active && " (inactive)"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {c.notes && (
            <SectionCard title="Notes">
              <p className="text-sm whitespace-pre-line">{c.notes}</p>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  )
}
