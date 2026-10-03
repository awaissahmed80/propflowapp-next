"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { Avatar } from "@/components/ui/avatar"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip } from "@/components/ui/tooltip"
import { assignLeads, loadAgentCard } from "../server/leads"

// The lead's agent in the panel header: their avatar (click for a card about them) and, for
// people who may, a ▾ menu to give the lead to someone else (or take an unassigned one).
//   run(fn): the lead panel's runner (saves, then reloads the lead)
export function AgentControl({ lead, agents, me, canEdit, canReassign, run }) {
  const agent = lead.agent
  const canChange = canEdit && (canReassign || !agent)
  // Without the reassign grant, the only move is taking an unassigned lead yourself
  const choices = canReassign ? agents : agents.filter((a) => a.id === me)
  return (
    <span className="ml-2 flex items-center">
      {agent ? (
        <AgentCard agent={agent} />
      ) : (
        <Tooltip content="Unassigned">
          <span className="flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground">
            <Icon name="user-line" className="text-sm" />
          </span>
        </Tooltip>
      )}
      {canChange && (
        <DropdownMenu
          align="start"
          className="max-h-80 w-64"
          items={[
            { type: "label", label: agent ? "Give this lead to" : "Assign to" },
            ...choices.map((a) => ({
              key: String(a.id),
              label: a.id === me ? `${a.name} (me)` : a.name,
              icon: <Avatar name={a.name} source={a.avatarUrl} size="sm" />,
              selected: a.id === agent?.id,
              onClick: () => a.id !== agent?.id && run(() => assignLeads([lead.code], a.id)),
            })),
            ...(agent && canReassign ? [{ type: "separator" }, { label: "Unassign", icon: "user-unfollow-line", onClick: () => run(() => assignLeads([lead.code], null)) }] : []),
          ]}
          trigger={
            <button
              type="button"
              aria-label="Change agent"
              className="ml-px flex h-6 w-3.5 cursor-pointer items-center justify-center rounded text-xs text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Icon name="arrow-down-s-line" />
            </button>
          }
        />
      )}
    </span>
  )
}

// The agent's avatar; clicking it loads a card about them (once per opening)
function AgentCard({ agent }) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState(null)
  const [error, setError] = useState("")
  const [, startTransition] = useTransition()
  const show = (next) => {
    setOpen(next)
    if (!next) return
    startTransition(async () => {
      setError("")
      const r = await loadAgentCard(agent.id)
      if (r.error) setError(r.error)
      else setCard(r.card)
    })
  }
  const c = card?.id === agent.id ? card : null

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Agent: ${agent.name}`}
            className="cursor-pointer rounded-full ring-offset-2 ring-offset-background outline-none transition hover:ring-2 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:ring-2 data-popup-open:ring-primary/40"
          >
            <Avatar name={agent.name} source={agent.avatarUrl} />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-80 gap-0 overflow-hidden p-0 text-sm">
        {error ? (
          <p className="px-4 py-6 text-center text-muted-foreground">{error}</p>
        ) : !c ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 border-b p-4">
              <Avatar name={c.name} source={c.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-tight font-semibold">{c.name}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{[c.designation, c.role].filter(Boolean).join(" · ")}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Agent on this lead</span>
                  {c.team && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{c.team}</span>}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x border-b">
              {[
                ["Open leads", c.open],
                ["Due today", c.dueToday],
                ["Booked this month", c.bookedThisMonth],
              ].map(([label, n]) => (
                <div key={label} className="px-2 py-3 text-center">
                  <p className={cn("text-base font-semibold tabular-nums", label === "Due today" && n > 0 && "text-amber-600 dark:text-amber-400")}>{n}</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <dl className="space-y-1.5 px-4 py-3">
              {c.phone && (
                <div className="flex items-center gap-2">
                  <Icon name="phone-line" className="text-muted-foreground" />
                  <dt className="sr-only">Mobile</dt>
                  <dd>
                    <a href={`tel:${c.phone}`} className="tabular-nums hover:text-primary">
                      {formatPkPhone(c.phone)}
                    </a>
                  </dd>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2">
                  <Icon name="mail-line" className="text-muted-foreground" />
                  <dt className="sr-only">Email</dt>
                  <dd className="min-w-0 truncate">
                    <a href={`mailto:${c.email}`} className="hover:text-primary">
                      {c.email}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="time-line" />
                <dt className="sr-only">Last active</dt>
                <dd className="text-[13px]">{c.status === "suspended" ? "Suspended" : c.lastActiveAt ? `Active ${timeAgo(c.lastActiveAt)}` : "Hasn't signed in yet"}</dd>
              </div>
            </dl>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
