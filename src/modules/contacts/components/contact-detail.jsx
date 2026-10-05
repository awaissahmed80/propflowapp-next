"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toHex } from "@/lib/color"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Tabs } from "@/components/ui/tabs"
import { budgetText, interestText } from "@/modules/crm/constants"
import { AgentChip, LeadStatusBadge, TempIcon } from "@/modules/crm/components/lead-parts"
import { StageBadge } from "@/modules/operations/components/sales-parts"
import { deleteContact } from "../server/actions"
import { ContactTypeBadges, Empty, telHref, waHref } from "./contact-parts"
import { ContactDialog } from "./contact-dialog"

// Contacts › one person or firm: who they are, and everything they have with the business across
// the apps this person can open (leads, bookings, Estate Management requests, payment requests),
// one timeline of what happened, and the records they're linked to. Data: contactDetail().
//   can: { edit, delete, newLead }

const leadHref = (code, archived) => `/crm/leads?lead=${urlCode(code)}${archived ? "&tab=archived" : ""}`
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const PAYMENT_STATUS = { issued: ["Issued", "amber"], paid: ["Paid", "green"], cancelled: ["Canceled", "gray"] }

function Lookup({ list, value }) {
  const v = useList(list).map[value]
  return (
    <Badge color={toHex(v?.color) ?? "gray"} dot>
      {v?.label ?? value}
    </Badge>
  )
}

function Rows({ children }) {
  return <div className="divide-y rounded-xl border bg-background shadow-xs">{children}</div>
}

function Hidden({ n, what }) {
  if (!n) return null
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon name="lock-line" /> {plural(n, `more ${what}`, `more ${what}s`)} handled by others, not shown to you.
    </p>
  )
}

function RecordRow({ href, icon, tone = "bg-muted text-muted-foreground", title, meta, children }) {
  return (
    <Link href={href} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-lg ${tone}`}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium group-hover:text-primary">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </div>
      {children}
    </Link>
  )
}

// One line of the timeline, whichever app it came from
function TimelineItem({ t }) {
  const activityTypes = useList("activity-type")
  const outcomes = useList("activity-outcome")
  let icon = "chat-check-line"
  let color = null
  let title = ""
  let href = null
  if (t.app === "crm" || (t.app === "operations" && t.type !== "system")) {
    const type = activityTypes.map[t.type]
    icon = type?.icon ?? "chat-check-line"
    color = toHex(type?.color)
    title = type?.label ?? t.type
  } else if (t.app === "operations") {
    icon = "file-paper-2-line"
    color = toHex("green")
    title = "Booking"
  } else {
    icon = t.type === "customer" ? "customer-service-2-line" : t.type === "note" ? "sticky-note-line" : "settings-4-line"
    color = toHex("violet")
    title = t.type === "customer" ? "Told the customer" : t.type === "note" ? "Note" : "Request"
  }
  if (t.ref) href = t.app === "crm" ? leadHref(t.ref) : t.app === "operations" ? `/operations/bookings/${urlCode(t.ref)}` : `/estate-management/requests/${urlCode(t.ref)}`
  const outcome = t.app === "crm" && t.outcome ? outcomes.map[t.outcome] : null
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ color: color ?? undefined, backgroundColor: `color-mix(in oklab, ${color ?? "#64748b"} 14%, transparent)` }}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">{title}</span>
          {outcome && (
            <span className="flex items-center gap-1 text-[13px]" style={{ color: toHex(outcome.color) }}>
              {outcome.icon && <Icon name={outcome.icon} />}
              {outcome.label}
            </span>
          )}
          <span className="text-[13px] text-muted-foreground">
            {timeAgo(t.at)}
            {t.by && ` · ${t.by}`}
            {href && (
              <>
                {" · "}
                <Link href={href} className="hover:text-primary">
                  {t.ref}
                </Link>
              </>
            )}
          </span>
        </p>
        {t.text && <p className="mt-0.5 text-[13px] whitespace-pre-line text-muted-foreground">{t.text}</p>}
      </div>
    </li>
  )
}

export function ContactDetail({ contact: c, can }) {
  const router = useRouter()
  const unitTypes = useList("unit-type")
  const sources = useList("lead-source")
  const requestTypes = useList("service-request-type")
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()
  const openLeads = c.leads.filter((l) => !l.archived && !["booked", "lost"].includes(l.status)).length

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: "They're removed from the directory. Only contacts with no leads, bookings or other records can be deleted.",
      confirmLabel: "Delete contact",
      destructive: true,
      icon: "delete-bin-line",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => deleteContact(c.code), { loading: "Deleting…", success: `${c.name} deleted.` })
      if (r?.ok) router.push("/contacts/all")
    })
  }

  const tabs = [
    {
      value: "timeline",
      label: "Timeline",
      icon: "history-line",
      count: c.timeline.length || null,
      content: c.timeline.length ? (
        <ul className="divide-y rounded-xl border bg-background shadow-xs">
          {c.timeline.map((t) => (
            <TimelineItem key={t.key} t={t} />
          ))}
        </ul>
      ) : (
        <Empty icon="history-line" text="Nothing logged yet: calls, visits, booking steps and requests show here." />
      ),
    },
    c.see.crm && {
      value: "leads",
      label: "Leads",
      icon: "user-star-line",
      count: c.leads.length + c.hiddenLeads,
      content: (
        <div className="space-y-3">
          {c.leads.length ? (
            <Rows>
              {c.leads.map((l) => (
                <Link key={l.code} href={leadHref(l.code, l.archived)} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <TempIcon priority={l.priority} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:text-primary">{interestText(l.interest, { typeLabel: unitTypes.label })}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[l.code, budgetText(l.interest, formatPkr), l.source && sources.label(l.source), `added ${timeAgo(l.createdAt)}`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <AgentChip agent={l.agent} className="hidden w-40 md:flex" />
                  {l.archived && <span className="text-xs text-muted-foreground">Archived</span>}
                  <LeadStatusBadge status={l.status} />
                </Link>
              ))}
            </Rows>
          ) : (
            <Empty icon="user-star-line" text="No leads for this contact yet.">
              {can.newLead && (
                <Button className="mt-4" variant="outline" leftIcon="add-line" nativeButton={false} render={<Link href={`/crm/leads?new=1&contact=${urlCode(c.code)}`} />}>
                  New lead
                </Button>
              )}
            </Empty>
          )}
          <Hidden n={c.hiddenLeads} what="lead" />
        </div>
      ),
    },
    c.see.sales && {
      value: "bookings",
      label: "Bookings",
      icon: "file-paper-2-line",
      count: c.bookings.length + c.hiddenBookings,
      content: (
        <div className="space-y-3">
          {c.bookings.length ? (
            <Rows>
              {c.bookings.map((b) => (
                <RecordRow
                  key={b.code}
                  href={`/operations/bookings/${urlCode(b.code)}`}
                  icon="trophy-line"
                  tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  title={[b.project, b.unit && `unit ${b.unit}`].filter(Boolean).join(", ")}
                  meta={`${b.code} · ${b.kind === "token" ? "Token" : "Full booking"} · ${formatDate(b.bookedAt)}`}
                >
                  <span className="hidden w-28 text-right text-sm font-semibold tabular-nums sm:block">{formatPkr(b.price)}</span>
                  <StageBadge stage={b.stage} />
                  <Lookup list="booking-status" value={b.status} />
                </RecordRow>
              ))}
            </Rows>
          ) : (
            <Empty icon="file-paper-2-line" text="No bookings yet." />
          )}
          <Hidden n={c.hiddenBookings} what="booking" />
        </div>
      ),
    },
    c.see.estate && {
      value: "requests",
      label: "Requests",
      icon: "customer-service-2-line",
      count: c.requests.length + c.hiddenRequests,
      content: (
        <div className="space-y-3">
          {c.requests.length ? (
            <Rows>
              {c.requests.map((r) => (
                <RecordRow
                  key={r.code}
                  href={`/estate-management/requests/${urlCode(r.code)}`}
                  icon={requestTypes.map[r.type]?.icon ?? "customer-service-2-line"}
                  tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  title={r.subject}
                  meta={[r.code, requestTypes.label(r.type), `logged ${formatDate(r.createdAt)}`, r.closedAt && `closed ${formatDate(r.closedAt)}`].filter(Boolean).join(" · ")}
                >
                  <Lookup list="service-status" value={r.status} />
                </RecordRow>
              ))}
            </Rows>
          ) : (
            <Empty icon="customer-service-2-line" text="No transfers, NDCs or other requests." />
          )}
          <Hidden n={c.hiddenRequests} what="request" />
        </div>
      ),
    },
    c.see.finance &&
      c.paymentRequests.length > 0 && {
        value: "payments",
        label: "Payment requests",
        icon: "bill-line",
        count: c.paymentRequests.length,
        content: (
          <Rows>
            {c.paymentRequests.map((p) => {
              const [label, color] = PAYMENT_STATUS[p.status] ?? [p.status, "gray"]
              return (
                <RecordRow key={p.code} href="/finance/payment-requests" icon="bill-line" title={p.code} meta={`Issued ${formatDate(p.issuedOn)} · due ${formatDate(p.dueOn)}`}>
                  <span className="w-28 text-right text-sm font-semibold tabular-nums">{formatPkr(p.total)}</span>
                  <Badge color={color} dot>
                    {label}
                  </Badge>
                </RecordRow>
              )
            })}
          </Rows>
        ),
      },
  ].filter(Boolean)

  const linked = [
    ...c.dealers.map((d) => ({ key: `d${d.code}`, icon: "shake-hands-line", label: "Dealer firm", text: `${d.name}${d.active ? "" : " (inactive)"}`, href: d.href })),
    ...c.employees.map((e) => ({ key: `e${e.code}`, icon: "id-card-line", label: "Employee", text: `${e.code}${e.status === "left" ? " (left)" : ""}`, href: `/hrm/employees/${urlCode(e.code)}` })),
    ...c.logins.map((m) => ({ key: `m${m.code}`, icon: "user-3-line", label: "Workspace login", text: m.email ?? m.code, href: m.href })),
  ]
  const address = [c.address, c.address?.includes(c.city ?? "\u0000") ? null : c.city].filter(Boolean).join(", ")

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/contacts/all" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Contacts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={c.name} size="xl" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{c.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <ContactTypeBadges types={c.types} max={6} />
                {(c.company || c.designation) && <span>{[c.designation, c.company].filter(Boolean).join(", ")}</span>}
                <span className="text-xs tabular-nums">{c.code}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  c.see.crm && c.leads.length + c.hiddenLeads > 0 && plural(c.leads.length + c.hiddenLeads, "lead"),
                  openLeads > 0 && `${openLeads} open`,
                  c.see.sales && c.bookings.length > 0 && plural(c.bookings.length, "booking"),
                  `added ${formatDate(c.createdAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.phone && (
              <Button variant="outline" leftIcon="phone-line" nativeButton={false} render={<a href={telHref(c.phone)} />}>
                Call
              </Button>
            )}
            {c.phone && c.whatsapp && (
              <Button variant="outline" leftIcon="whatsapp-line" nativeButton={false} render={<a href={waHref(c.phone)} target="_blank" rel="noreferrer" />}>
                WhatsApp
              </Button>
            )}
            {can.edit && (
              <Button variant="outline" leftIcon="edit-line" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {can.newLead && (
              <Button leftIcon="add-line" nativeButton={false} render={<Link href={`/crm/leads?new=1&contact=${urlCode(c.code)}`} />}>
                New lead
              </Button>
            )}
            {can.delete && (
              <DropdownMenu
                align="end"
                items={[{ label: "Delete contact", icon: "delete-bin-line", variant: "destructive", onClick: remove }]}
                trigger={<IconButton icon="more-2-line" variant="outline" aria-label="More actions" tooltip={false} />}
              />
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
                {c.phone ? (
                  <>
                    <span className="tabular-nums">{formatPkPhone(c.phone)}</span>
                    {c.whatsapp && <span className="text-xs text-muted-foreground"> · WhatsApp</span>}
                  </>
                ) : (
                  "—"
                )}
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
              {c.kind !== "company" && (
                <>
                  <DetailRow icon="bank-card-line" label="CNIC">
                    <span className="font-mono">{c.cnic ?? "—"}</span>
                  </DetailRow>
                  <DetailRow icon="parent-line" label="Father / husband">
                    {c.guardianName ? `${c.guardianRelation ?? ""} ${c.guardianName}`.trim() : "—"}
                  </DetailRow>
                </>
              )}
              <DetailRow icon="map-pin-2-line" label="Address">
                {[address, c.overseas && "Overseas"].filter(Boolean).join(" · ") || "—"}
              </DetailRow>
              <DetailRow icon="calendar-2-line" label="Added">
                {formatDate(c.createdAt)}
              </DetailRow>
            </div>
          </SectionCard>

          {linked.length > 0 && (
            <SectionCard title="Linked records" bodyClassName="p-0">
              <ul className="divide-y">
                {linked.map((r) => {
                  const body = (
                    <>
                      <Icon name={r.icon} className="text-base text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">{r.label}</span>
                        <span className="block truncate text-sm group-hover:text-primary">{r.text}</span>
                      </span>
                      {r.href && <Icon name="arrow-right-s-line" className="text-muted-foreground" />}
                    </>
                  )
                  return (
                    <li key={r.key}>
                      {r.href ? (
                        <Link href={r.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </SectionCard>
          )}

          <SectionCard
            title="Notes"
            action={
              can.edit && (
                <button type="button" onClick={() => setEditing(true)} className="cursor-pointer text-xs font-medium text-primary hover:underline">
                  {c.notes ? "Edit" : "Add"}
                </button>
              )
            }
          >
            {c.notes ? <p className="text-sm whitespace-pre-line">{c.notes}</p> : <p className="text-sm text-muted-foreground">No notes yet.</p>}
          </SectionCard>
        </aside>
      </div>

      {editing && (
        <ContactDialog
          contact={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
