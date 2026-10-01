"use client"

import Link from "next/link"
import { useState } from "react"
import { formatPkr } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { labelOf } from "@/modules/lookups/options"
import { lastActive, teamColor } from "@/modules/users/constants"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

function Target({ label, done, target, format = (n) => n }) {
  const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0
  return (
    <div>
      <p className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format(done)} of {format(target)}
        </span>
      </p>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

// My Desk › My team: the teams you're in or lead, their target and the people in them
export function MyTeamView({ teams, currentUserId, lists, canManage }) {
  const [now] = useState(() => Date.now())
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My team"
        description="The people you work with and how the team is doing this month."
        actions={
          canManage && (
            <Button variant="outline" leftIcon="settings-3-line" nativeButton={false} render={<Link href="/users/teams" />}>
              Manage teams
            </Button>
          )
        }
      />
      {teams.map((t) => {
        const people = [...(t.lead && !t.members.some((m) => m.id === t.lead.id) ? [t.lead] : []), ...t.members].sort((a, b) => (b.id === t.leadId) - (a.id === t.leadId))
        return (
          <section key={t.id} className="rounded-xl border bg-background shadow-xs">
            <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
              <span className="size-3 rounded-full" style={{ backgroundColor: teamColor(t.color) }} />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{t.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Led by {t.lead?.name ?? "—"}
                  {t.description ? ` · ${t.description}` : ""}
                </p>
              </div>
            </header>
            {(t.target.bookings > 0 || t.target.value > 0) && (
              <div className="grid gap-4 border-b px-4 py-3 sm:grid-cols-2">
                <Target label="Bookings this month" done={t.achieved.bookings} target={t.target.bookings} />
                <Target label="Booking value" done={t.achieved.value} target={t.target.value} format={formatPkr} />
              </div>
            )}
            <ul className="divide-y">
              {people.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar name={m.name} source={m.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {m.name}
                      {m.id === t.leadId && <Badge color="blue">Lead</Badge>}
                      {m.id === currentUserId && <Badge color="gray">You</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{labelOf(lists.designation, m.designation) ?? m.role}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{lastActive(m.lastActiveAt, now)}</span>
                  {m.phone && (
                    <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`} title={formatPkPhone(m.phone)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Icon name="phone-line" />
                    </a>
                  )}
                  <a href={`mailto:${m.email}`} aria-label={`Email ${m.name}`} title={m.email} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon name="mail-line" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
