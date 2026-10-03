"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { urlCode } from "@/lib/url"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { iconButtonVariants } from "@/components/ui/icon-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadStatusBadge, telHref, whatsappHref } from "@/modules/crm/components/lead-parts"
import { StageBadge } from "@/modules/operations/components/sales-parts"
import { loadContactCard } from "../server/card"

// The contact card, the same wherever a person shows up: click the trigger and it loads who
// they are, how to reach them, how much contact there's been, their leads and bookings (what
// your role may see), with View contact for the full page.
//   from: { lead: code } | { booking: code } | { contact: code }
//   trigger: the element that opens it (rendered as the popover's trigger)
//   onOpenLead(code): open a lead in place (CRM) instead of going to it · onEmail(): email them
export function ContactCardPopover({ from, trigger, onOpenLead, onEmail, align = "start" }) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState(null)
  const [error, setError] = useState("")
  const [, startTransition] = useTransition()

  const show = (next) => {
    setOpen(next)
    if (next && !card)
      startTransition(async () => {
        setError("")
        const r = await loadContactCard(from)
        if (r.error) setError(r.error)
        else setCard(r.card)
      })
  }
  const close =
    (fn) =>
    (...args) => {
      setOpen(false)
      fn?.(...args)
    }

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} sideOffset={6} className="w-[24rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0">
        {error ? (
          <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">{error}</p>
        ) : !card ? (
          <CardSkeleton />
        ) : (
          <Card card={card} onOpenLead={onOpenLead && close(onOpenLead)} onEmail={onEmail && close(onEmail)} onLeave={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  )
}

function CardSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading contact">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="border-b last:border-b-0">
      <p className="px-4 pt-3 pb-1 text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}

function Card({ card, onOpenLead, onEmail, onLeave }) {
  const sources = useList("lead-source")
  const t = card.touches
  const touches = [
    ["phone-line", "Calls", t.calls],
    ["whatsapp-line", "WhatsApp", t.whatsapp],
    ["team-line", "Meetings", t.meetings],
    ["map-pin-user-line", "Site visits", t.visits],
  ]
  const hasTouches = touches.some(([, , n]) => n > 0)
  return (
    <div className="text-[15px]">
      {/* Who */}
      <div className="flex items-start gap-3 border-b p-4">
        <Avatar name={card.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg leading-tight font-semibold tracking-tight">{card.name}</p>
          {card.phone && (
            <p className="mt-0.5 flex items-center gap-1 text-muted-foreground tabular-nums">
              {formatPkPhone(card.phone)}
              <CopyButton text={formatPkPhone(card.phone)} label="Copy number" />
            </p>
          )}
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {card.code} · known since {formatDate(card.since)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {card.phone && (
            <a href={telHref(card.phone)} aria-label="Call" title="Call" className={iconButtonVariants({ variant: "outline", size: "sm" })}>
              <Icon name="phone-line" />
            </a>
          )}
          {onEmail && (
            <button type="button" onClick={onEmail} aria-label="Email" title="Email" className={iconButtonVariants({ variant: "outline", size: "sm" })}>
              <Icon name="mail-line" />
            </button>
          )}
          {card.phone && card.whatsapp && (
            <a
              href={whatsappHref(card.phone, card.name)}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp"
              title="WhatsApp"
              className={cn(iconButtonVariants({ variant: "outline", size: "sm" }), "text-emerald-600 dark:text-emerald-400")}
            >
              <Icon name="whatsapp-line" />
            </a>
          )}
        </div>
      </div>

      <dl className="space-y-1.5 border-b px-4 py-3">
        <Row icon="mail-line" label="Email">
          {card.email ? (
            <a href={`mailto:${card.email}`} className="text-primary hover:underline">
              {card.email}
            </a>
          ) : null}
        </Row>
        <Row icon="map-pin-line" label="City">
          {[card.city, card.overseas && "Overseas"].filter(Boolean).join(" · ") || null}
        </Row>
        <Row icon="time-line" label="Last contact">
          {t.lastAt ? timeAgo(t.lastAt) : null}
        </Row>
      </dl>

      {card.dealer && (
        <p className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-[13px] text-amber-800 dark:text-amber-300">
          <Icon name="shake-hands-line" className="text-[15px]" />
          Also a registered dealer: {card.dealer.name}
          {!card.dealer.active && " (inactive)"}
        </p>
      )}

      {hasTouches && (
        <div className="grid grid-cols-4 border-b">
          {touches.map(([icon, label, n]) => (
            <div key={label} className="flex flex-col items-center gap-0.5 px-1 py-3 text-center" title={label}>
              <Icon name={icon} className="text-base text-muted-foreground" />
              <span className="font-semibold tabular-nums">{n}</span>
              <span className="text-[12px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
        {(card.bookings.length > 0 || card.hiddenBookings > 0) && (
          <Section title={`Bookings · ${card.bookings.length + card.hiddenBookings}`}>
            <ul className="pb-1">
              {card.bookings.map((b) => (
                <li key={b.code}>
                  <Link
                    href={`/operations/bookings/${urlCode(b.code)}`}
                    onClick={onLeave}
                    aria-current={b.current || undefined}
                    className={cn("flex items-center gap-2 px-4 py-2 hover:bg-muted/60", b.current && "pointer-events-none")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {[b.project, b.unit].filter(Boolean).join(" · ")}
                        {b.current && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">· this booking</span>}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground tabular-nums">{[b.code, formatPkr(b.net), formatDate(b.bookedAt)].join(" · ")}</span>
                    </span>
                    <StageBadge stage={b.stage} />
                  </Link>
                </li>
              ))}
            </ul>
            {card.hiddenBookings > 0 && <p className="px-4 pb-2 text-[13px] text-muted-foreground">{card.hiddenBookings} more handled by others, not shown to you.</p>}
          </Section>
        )}

        {(card.leads.length > 0 || card.hiddenLeads > 0) && (
          <Section title={`Leads · ${card.leads.length + card.hiddenLeads}`}>
            <ul className="pb-1">
              {card.leads.map((l) => {
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {l.project ?? "No project yet"}
                        {l.current && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">· this lead</span>}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">{[l.code, l.source && sources.label(l.source), l.agent, formatDate(l.createdAt)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <LeadStatusBadge status={l.status} />
                  </>
                )
                const cls = cn("flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/60", l.current && "pointer-events-none")
                return (
                  <li key={l.code}>
                    {onOpenLead ? (
                      <button type="button" disabled={l.current} onClick={() => onOpenLead(l.code)} className={cn(cls, "cursor-pointer")}>
                        {body}
                      </button>
                    ) : (
                      <Link href={`/crm/leads?lead=${urlCode(l.code)}`} onClick={onLeave} className={cls}>
                        {body}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
            {card.hiddenLeads > 0 && <p className="px-4 pb-2 text-[13px] text-muted-foreground">{card.hiddenLeads} more with other agents, not shown to you.</p>}
          </Section>
        )}
      </div>

      <div className="border-t bg-muted/40 p-3">
        <Button className="w-full" variant="outline" rightIcon="arrow-right-line" nativeButton={false} render={<Link href={`/crm/contacts/${urlCode(card.code)}`} onClick={onLeave} />}>
          View contact
        </Button>
      </div>
    </div>
  )
}

// Copy to the clipboard, with a moment of ✓ "Copied"
function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard blocked (e.g. not a secure page): nothing to do
        }
      }}
      className={cn(
        "inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        copied && "text-emerald-600 dark:text-emerald-400",
      )}
    >
      <Icon name={copied ? "check-line" : "file-copy-line"} className="text-[15px]" />
    </button>
  )
}

function Row({ icon, label, children }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="shrink-0 text-muted-foreground" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate">{children ?? <span className="text-muted-foreground">No {label.toLowerCase()}</span>}</dd>
    </div>
  )
}
