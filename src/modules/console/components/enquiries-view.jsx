"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Badge } from "@/components/ui/badge"
import { ENQUIRY_STATUSES } from "../statuses"
import { businessType, need } from "@/modules/web/quote"
import { AppIcon } from "@/components/app-icon"
import { InviteWorkspaceButton } from "./workspace-invites"

const KIND = { demo: { label: "Demo request", color: "violet" }, sales: { label: "Sales enquiry", color: "sky" }, trial: { label: "Trial request", color: "green" }, quote: { label: "Get started", color: "amber" } }
import { EmptyState, StatusBadge } from "./parts"

const digits = (s) => (s ?? "").replace(/\D/g, "")
// Pakistani numbers for tel: and WhatsApp: 03001234567 → 923001234567
const intl = (phone) => {
  const d = digits(phone)
  return d.startsWith("0") ? `92${d.slice(1)}` : d
}

function Detail({ e, invite }) {
  return (
    <div className="space-y-5 p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{e.company || e.name}</h2>
          <Badge color={KIND[e.kind]?.color ?? "sky"}>{KIND[e.kind]?.label ?? "Enquiry"}</Badge>
          <StatusBadge list={ENQUIRY_STATUSES} value={e.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {e.code} · {e.name}
          {e.city ? ` · ${e.city}` : ""} · {timeAgo(e.createdAt)}
          {e.source ? ` · via ${e.source}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {e.phone && (
          <>
            <Button size="sm" variant="outline" leftIcon="phone-line" nativeButton={false} render={<a href={`tel:+${intl(e.phone)}`} />}>
              {e.phone}
            </Button>
            <Button size="sm" variant="outline" leftIcon="whatsapp-line" nativeButton={false} render={<a href={`https://wa.me/${intl(e.phone)}`} target="_blank" rel="noreferrer" />}>
              WhatsApp
            </Button>
          </>
        )}
        {e.email && (
          <Button size="sm" variant="outline" leftIcon="mail-line" nativeButton={false} render={<a href={`mailto:${e.email}`} />}>
            Email
          </Button>
        )}
      </div>
      {e.kind === "quote" && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon name={businessType(e.businessType)?.icon ?? "briefcase-line"} className="text-base text-amber-600 dark:text-amber-400" />
            {businessType(e.businessType)?.label ?? "Business"}
          </p>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Wants to</p>
            <ul className="space-y-1">
              {(e.needs ?? []).map((v) => (
                <li key={v} className="flex items-center gap-2 text-sm">
                  <Icon name={need(v)?.icon ?? "check-line"} className="text-muted-foreground" />
                  {need(v)?.label ?? v}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Their package</p>
            <ul className="space-y-1">
              {(e.modules ?? []).map((m) => (
                <li key={m.code} className="flex items-center gap-2 text-sm">
                  {m.icon ? <AppIcon icon={m.icon} color={m.color} size="sm" className="size-6 rounded-md text-xs" /> : null}
                  <span className="font-medium">{m.name}</span>
                  {m.without && <span className="text-xs text-muted-foreground">{m.without}</span>}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm">
            {e.suggestedPlan ? (
              <>
                Smallest plan that covers it: <span className="font-semibold">{e.suggestedPlan.name}</span>
                <span className="text-muted-foreground"> (Rs {new Intl.NumberFormat("en-PK").format(e.suggestedPlan.priceMonthly)} a month)</span>
              </>
            ) : (
              <span className="text-muted-foreground">No single plan has all of these: set up a custom package.</span>
            )}
          </p>
          {invite && e.package?.apps?.length > 0 && (
            <InviteWorkspaceButton
              plans={invite.plans}
              defaults={invite.defaults}
              apps={invite.apps}
              label="Create workspace with this package"
              size="sm"
              leftIcon="add-circle-line"
              initial={{ contactName: e.name, email: e.email ?? "", phone: e.phone ?? "", companyName: e.company ?? "", planId: e.suggestedPlan?.id, package: e.package, note: `From ${e.code}` }}
            />
          )}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
        {[
          ...(e.kind === "quote" ? [] : [["Plan", e.plan ?? "Not sure"]]),
          ["Projects", e.projects ?? "—"],
          ["Team", e.teamSize ? `${e.teamSize} people` : "—"],
          ["Best time to call", e.callTime ?? "—"],
          ["Assigned to", e.assignee?.name ?? "Unassigned"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {e.kind !== "quote" && e.interests?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {e.interests.map((i) => (
            <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {i}
            </span>
          ))}
        </div>
      )}
      {e.message && <p className="rounded-xl bg-muted/60 p-3 text-sm">“{e.message}”</p>}
      {e.notes && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Internal notes</p>
          <p className="text-sm whitespace-pre-line">{e.notes}</p>
        </div>
      )}
    </div>
  )
}

export function EnquiriesView({ list, invite = null }) {
  const [status, setStatus] = useState("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(list[0]?.id ?? null)
  const [mobileDetail, setMobileDetail] = useState(false)

  const q = search.trim().toLowerCase()
  const visible = list.filter((e) => (status === "all" || e.status === status) && (!q || [e.company, e.name, e.email, e.city, e.code].some((v) => v?.toLowerCase().includes(q))))
  const current = list.find((e) => e.id === selected)

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Sales Enquiries"
        description="Demo and sales requests from the website"
        toolbar={
          <div className="min-w-32 flex-1 sm:max-w-80">
            <Input type="search" placeholder="Company, name, email or city…" aria-label="Search enquiries" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
      />
      {list.length === 0 ? (
        <div className="rounded-xl border bg-background">
          <EmptyState icon="customer-service-2-line" title="No enquiries yet">
            Enquiries from the website’s contact and demo forms land here.
          </EmptyState>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1.5">
            {[{ value: "all", label: "All" }, ...ENQUIRY_STATUSES].map((s) => {
              const n = s.value === "all" ? list.length : list.filter((e) => e.status === s.value).length
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={status === s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn("h-8 rounded-full border px-3 text-sm", status === s.value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
                >
                  {s.label} <span className="opacity-70">{n}</span>
                </button>
              )
            })}
          </div>
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <ScrollView className={cn("min-h-0 rounded-xl border bg-background", mobileDetail && "max-lg:hidden")}>
              <ul className="divide-y">
                {visible.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(e.id)
                        setMobileDetail(true)
                      }}
                      aria-current={selected === e.id}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50", selected === e.id && "bg-primary/5")}
                    >
                      {e.status === "new" && <span className="mt-2 size-2 shrink-0 rounded-full bg-sky-500" aria-label="New" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.company || e.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {e.name} · {e.city || "—"} · {timeAgo(e.createdAt)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusBadge list={ENQUIRY_STATUSES} value={e.status} />
                          {e.assignee && <span className="text-xs text-muted-foreground">{e.assignee.name}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {!visible.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No enquiries here.</li>}
              </ul>
            </ScrollView>
            <ScrollView className={cn("min-h-0 rounded-xl border bg-background", !mobileDetail && "max-lg:hidden")}>
              <button type="button" onClick={() => setMobileDetail(false)} className="flex items-center gap-1 px-5 pt-4 text-sm text-muted-foreground hover:text-foreground lg:hidden">
                <Icon name="arrow-left-line" /> All enquiries
              </button>
              {current ? <Detail key={current.id} e={current} invite={invite} /> : <p className="p-10 text-center text-sm text-muted-foreground">Pick an enquiry.</p>}
            </ScrollView>
          </div>
        </>
      )}
    </div>
  )
}
