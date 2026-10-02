"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { urlCode } from "@/lib/url"
import { formatDate, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { IconButton, iconButtonVariants } from "@/components/ui/icon-button"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { loadContactCard } from "../server/leads"
import { LeadStatusBadge, telHref, whatsappHref } from "./lead-parts"

// The small info icon in the lead header: a card about the person behind the lead, loaded
// the first time it's opened. Everything known about this mobile number: their enquiries,
// how much contact there's been, and whether they're also a dealer.
//   <ContactCardButton code="LD-00012" onOpenLead={(code) => …} />
export function ContactCardButton({ code, onOpenLead, onEmail }) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState(null)
  const [error, setError] = useState("")
  const [, startTransition] = useTransition()

  const show = (next) => {
    setOpen(next)
    if (next && !card)
      startTransition(async () => {
        setError("")
        const r = await loadContactCard(code)
        if (r.error) setError(r.error)
        else setCard(r.card)
      })
  }

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger render={<IconButton icon="information-line" size="sm" aria-label="Contact card" tooltip={false} />} />
      <PopoverContent align="start" sideOffset={6} className="w-[24rem] gap-0 overflow-hidden p-0">
        {error ? (
          <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">{error}</p>
        ) : !card ? (
          <CardSkeleton />
        ) : (
          <Card
            card={card}
            onEmail={
              onEmail &&
              (() => {
                setOpen(false)
                onEmail()
              })
            }
            onOpenLead={(c) => {
              setOpen(false)
              onOpenLead?.(c)
            }}
          />
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

function Card({ card, onOpenLead, onEmail }) {
  const sources = useList("lead-source")
  const c = card.contact
  const touches = [
    ["phone-line", "Calls", c.calls],
    ["whatsapp-line", "WhatsApp", c.whatsapp],
    ["team-line", "Meetings", c.meetings],
    ["map-pin-user-line", "Site visits", c.visits],
  ]
  return (
    <div className="text-[15px]">
      {/* Who */}
      <div className="flex items-start gap-3 border-b p-4">
        <Avatar name={card.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg leading-tight font-semibold tracking-tight">{card.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-muted-foreground tabular-nums">
            {formatPkPhone(card.phone)}
            <CopyButton text={formatPkPhone(card.phone)} label="Copy number" />
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Known since {formatDate(card.since)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <a href={telHref(card.phone)} aria-label="Call" title="Call" className={iconButtonVariants({ variant: "outline", size: "sm" })}>
            <Icon name="phone-line" />
          </a>
          {onEmail && (
            <button type="button" onClick={onEmail} aria-label="Email" title="Email" className={iconButtonVariants({ variant: "outline", size: "sm" })}>
              <Icon name="mail-line" />
            </button>
          )}
          {card.whatsapp && (
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
          {c.lastAt ? timeAgo(c.lastAt) : null}
        </Row>
      </dl>

      {card.dealer && (
        <p className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-[13px] text-amber-800 dark:text-amber-300">
          <Icon name="shake-hands-line" className="text-[15px]" />
          Also a registered dealer: {card.dealer.name}
          {!card.dealer.active && " (inactive)"}
        </p>
      )}

      {/* How much contact */}
      <div className="grid grid-cols-4 border-b">
        {touches.map(([icon, label, n]) => (
          <div key={label} className="flex flex-col items-center gap-0.5 px-1 py-3 text-center" title={label}>
            <Icon name={icon} className="text-base text-muted-foreground" />
            <span className="font-semibold tabular-nums">{n}</span>
            <span className="text-[12px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      {(c.planned > 0 || c.missed > 0) && (
        <p className="border-b px-4 py-2 text-[13px] text-muted-foreground">
          {[c.planned > 0 && `${c.planned} follow-up${c.planned === 1 ? "" : "s"} planned`, c.missed > 0 && `${c.missed} missed`].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Their enquiries */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-[13px] font-semibold text-muted-foreground">{card.enquiries.length === 1 && !card.hidden ? "1 enquiry" : `${card.enquiries.length + card.hidden} enquiries`}</p>
      </div>
      <ul className="max-h-56 overflow-y-auto pb-2">
        {card.enquiries.map((e) => (
          <li key={e.code}>
            <button
              type="button"
              disabled={e.current}
              onClick={() => onOpenLead(e.code)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {e.project ?? "No project yet"}
                  {e.current && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">· this lead</span>}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">{[e.code, e.source && sources.label(e.source), e.agent, formatDate(e.createdAt)].filter(Boolean).join(" · ")}</span>
              </span>
              <LeadStatusBadge status={e.status} />
            </button>
          </li>
        ))}
      </ul>
      {card.hidden > 0 && <p className="border-t px-4 py-2 text-[13px] text-muted-foreground">{card.hidden} more with other agents, not shown to you.</p>}
      {card.contactCode && (
        <Link href={`/crm/contacts/${urlCode(card.contactCode)}`} className="flex items-center justify-between border-t px-4 py-2.5 text-[14px] font-medium text-primary hover:bg-muted/60">
          View contact
          <Icon name="arrow-right-s-line" />
        </Link>
      )}
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
